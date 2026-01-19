# Antigravity — GLB / PLY / SOG Web Viewer (как gltf-viewer.donmccurdy.com, но с гибким светом)

Цель: сделать веб-вьювер (drag’n’drop + file picker) для:
- **GLB / glTF 2.0** (обычные меши/сцены)
- **PLY** (меши И/ИЛИ 3D Gaussian Splats — см. авто-детект)
- **SOG** (Spatially Ordered Gaussians — компактный формат 3DGS)
с возможностью гибко настраивать:
- HDRI/Environment (IBL), отражения, PMREM
- Tone mapping, экспозицию, гамму, пост-эффекты (опционально)
- Добавлять/удалять источники света (Directional/Spot/Point/RectArea)
- Материал/рендер-параметры (metalness/roughness, envIntensity, AO)
- Орбитальная навигация, фокус на объект, скриншот, reset.

Референс по UX и базовой структуре: Don McCurdy three-gltf-viewer.

---

## 0) Выбор движка и библиотек

**База:**
- Vite + TypeScript
- three.js
- OrbitControls
- lil-gui (панель настроек)
- GLTFLoader (GLB)
- PLYLoader (PLY меши)
- RGBELoader (HDRI)

**3D Gaussian Splats (PLY/SOG):**
Рекомендуемая интеграция — **Spark (THREE.js Gaussian Splatting renderer)**, т.к. заявляет поддержку основных форматов, включая **.PLY и .SOG**, и стыкуется с пайплайном three.js.

Дополнительно (конвертация/диагностика форматов):
- PlayCanvas **splat-transform** — читает/пишет PLY/SOG и др., может пригодиться для тестов и конвертации (в т.ч. CLI).
- Спецификация **SOG** (что это и почему маленький).

---

## 1) MVP UX / сценарии

### 1.1 Основные сценарии
1) Пользователь перетаскивает файл в окно → сцена грузится → камера авто-фреймит.
2) Пользователь выбирает файл кнопкой.
3) Пользователь меняет освещение:
   - HDRI (выбор из пресетов) или выключить
   - Экспозиция / tone mapping
   - Добавить 1–3 источника света, менять параметры
4) Пользователь делает скриншот (PNG) текущего кадра.
5) Reset scene (очистить).

### 1.2 UI раскладка
- Центр: канвас WebGL
- Слева/справа: collapsible панель (lil-gui)
- Верх: кнопки `Open`, `Reset`, `Screenshot`, `Fit`, `Grid`, `Axes`.

---

## 2) Архитектура проекта

Предложенная структура:

```
/src
  /core
    renderer.ts        // init WebGLRenderer + tone mapping
    scene.ts           // Scene + helpers (grid/axes)
    camera.ts          // PerspectiveCamera + fitToObject
    controls.ts        // OrbitControls
    env.ts             // HDRI/PMREM/environment controls
    lights.ts          // factory + registry of lights
  /loaders
    loadGLB.ts
    loadPLYMesh.ts
    loadSplats.ts      // Spark integration (PLY/SOG)
    detectPLYType.ts   // mesh vs splat heuristics
    loadAny.ts         // router by extension
  /ui
    gui.ts             // lil-gui bindings
    dropzone.ts        // drag’n’drop
  index.ts
  styles.css
```

---

## 3) Инициализация рендера и сцены

### 3.1 Renderer (tone mapping + физически корректный свет)
- `renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })`
- `renderer.outputColorSpace = THREE.SRGBColorSpace`
- `renderer.toneMapping = THREE.ACESFilmicToneMapping` (переключаемо)
- `renderer.toneMappingExposure = 1.0` (GUI)
- `renderer.physicallyCorrectLights = true`
- `renderer.shadowMap.enabled = true` (опционально)

### 3.2 Scene helpers
- GridHelper toggle
- AxesHelper toggle
- Neutral background (или background от HDRI)

---

## 4) HDRI / окружение / отражения (PMREM)

Для реалистичных рефлексов:
- Загружать `.hdr` через `RGBELoader`
- Прогонять через `PMREMGenerator` → `scene.environment = pmremTexture`
- Отдельный `scene.background`:
  - Off / Solid color / HDRI blurred (переключаемо)

GUI параметры:
- `env.enabled`
- `env.hdriPreset` (список: studio, indoor, sunset, night…)
- `env.intensity` (применять к материалам / envMapIntensity)
- `background.mode`: none / color / hdri

---

## 5) Свет (настраиваемые источники)

Сделать реестр источников света:
- DirectionalLight (ключевой)
- HemisphereLight (мягкий общий)
- SpotLight (акценты)
- RectAreaLight (если нужно “софтбокс”)
- PointLight (локальные)

GUI:
- добавить свет: type + name
- удалить свет
- параметры: intensity, color, position, target, angle/penumbra, distance, castShadow

---

## 6) Загрузка форматов

### 6.1 Роутинг по расширению
- `.glb`, `.gltf` → GLTFLoader
- `.ply` → авто-детект:
  - если это “обычный mesh PLY” → PLYLoader
  - если это “Gaussian splat PLY” → Spark loader (см. 6.3)
- `.sog` → Spark loader (см. 6.3)

### 6.2 PLY авто-детект (mesh vs splat)
PLY gaussian splat файлы часто содержат нестандартные vertex properties (например, spherical harmonics / gaussian params).
Сделать простую эвристику:
- Прочитать header (до `end_header`)
- Если встречаются свойства вроде `f_dc_`, `opacity`, `scale_`, `rot_`, `sh_` и т.п. → считать splat
- Иначе → mesh

### 6.3 Spark: PLY/SOG splats
Интеграция в three.js сцены:
- Инициализировать Spark renderer/объект(ы)
- Загружать splat файлы (PLY/SOG) и добавлять “splat mesh” в сцену
- Поддержать параметры:
  - point size / splat scale (если доступно)
  - quality / LOD (если доступно)
  - background blending

> Примечание: SOG — компактный контейнер для 3D Gaussian Splats (lossy quantization), обычно сильно меньше PLY.

---

## 7) Материалы и “рефлексы” для GLB

Для GLB:
- Пройтись по `gltf.scene.traverse((obj) => { if (obj.isMesh) ... })`
- Включить `castShadow/receiveShadow`
- В GUI добавить:
  - global overrides: `metalness`, `roughness`, `envMapIntensity` (мультипликатор)
  - toggles: `useOriginalMaterials` vs `override`

Важно: не ломать авторские материалы по умолчанию — override должен быть опциональным.

---

## 8) Камера и навигация

Функции:
- `fitToObject(object3D)`:
  - вычислить bounding box
  - подобрать distance по FOV
  - выставить controls.target в центр
- `resetCamera()`
- `setPresetView(front/top/left/isometric)`

---

## 9) Drag’n’drop и обработка файлов

Dropzone:
- принимать один файл
- показывать “Loading…” + прогресс (если возможно)
- читать как `ArrayBuffer` (для большинства загрузчиков удобнее)
- для HDRI — отдельный picker (или drag’n’drop в специальную зону)

---

## 10) Скриншот / экспорт кадра

- `renderer.domElement.toDataURL("image/png")`
- создать `<a download>` → клик
- опционально: upscale через `setPixelRatio(2)` на момент снимка

---

## 11) Производительность (минимальный набор)

- `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- Debounce resize
- Для splats:
  - quality preset: Low/Med/High
  - ограничение FPS (опционально)

---

## 12) Команды запуска (Vite)

```bash
npm create vite@latest web-viewer -- --template vanilla-ts
cd web-viewer
npm i three lil-gui
# loaders входят в three/examples (без отдельной установки)
# + Spark (подключить согласно документации пакета/репо)
npm run dev
```

---

## 13) Acceptance Criteria (чеклист)

- [ ] Drag’n’drop открывает GLB/PLY/SOG
- [ ] GLB отображается с OrbitControls, есть Fit to model
- [ ] PLY mesh отображается через PLYLoader
- [ ] PLY splat и SOG отображаются через Spark
- [ ] HDRI можно переключать, отражения меняются (PMREM)
- [ ] Можно добавить/удалить источники света и менять их параметры
- [ ] Экспозиция и tone mapping меняются в реальном времени
- [ ] Нет крэшей при повторной загрузке (полная очистка сцены + dispose ресурсов)
- [ ] Скриншот сохраняется в PNG

---

## 14) Ресурсы для ориентира

- Don McCurdy three-gltf-viewer (UX/структура)
- PLYLoader docs (mesh PLY)
- Spark (Three.js splats, форматы включая PLY/SOG)
- SOG format spec (что за формат)
- splat-transform (конвертация/утилиты)
