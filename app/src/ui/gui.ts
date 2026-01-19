import GUI from 'lil-gui';
import * as THREE from 'three';
import { ViewerRenderer } from '../core/renderer';
import { ViewerScene } from '../core/scene';
import { EnvironmentManager, type BackgroundMode } from '../core/env';
import { LightsManager, type LightType, type ManagedLight } from '../core/lights';
import { ViewerControls } from '../core/controls';

export interface GUIParams {
    // Renderer
    toneMapping: string;
    exposure: number;
    noiseEnabled: boolean;
    noiseIntensity: number;

    // Scene
    showGrid: boolean;
    showAxes: boolean;
    backgroundColor: string;

    // Environment
    envEnabled: boolean;
    envIntensity: number;
    backgroundMode: string;

    // Shadows
    shadowsEnabled: boolean;
    shadowIntensity: number;
    shadowSoftness: number;
    shadowGroundVisible: boolean;

    // Controls
    autoRotate: boolean;
    autoRotateSpeed: number;

    // Material overrides (for GLB)
    overrideMaterials: boolean;
    metalness: number;
    roughness: number;
}

const defaultParams: GUIParams = {
    toneMapping: 'Cineon',
    exposure: 0.5,
    noiseEnabled: false,
    noiseIntensity: 0.25,
    showGrid: true,
    showAxes: true,
    backgroundColor: '#000000',
    envEnabled: true,
    envIntensity: 3,
    backgroundMode: 'color',
    shadowsEnabled: true,
    shadowIntensity: 1,
    shadowSoftness: 4.5,
    shadowGroundVisible: true,
    autoRotate: false,
    autoRotateSpeed: 2.0,
    overrideMaterials: true,
    metalness: 0.65,
    roughness: 1.0,
};

const TONE_MAPPING_OPTIONS: Record<string, THREE.ToneMapping> = {
    'None': THREE.NoToneMapping,
    'Linear': THREE.LinearToneMapping,
    'Reinhard': THREE.ReinhardToneMapping,
    'Cineon': THREE.CineonToneMapping,
    'ACES Filmic': THREE.ACESFilmicToneMapping,
    'AgX': THREE.AgXToneMapping,
    'Neutral': THREE.NeutralToneMapping,
};

export class ViewerGUI {
    private gui: GUI;
    private params: GUIParams;
    private viewerRenderer: ViewerRenderer;
    private viewerScene: ViewerScene;
    private envManager: EnvironmentManager;
    private lightsManager: LightsManager;
    private controls: ViewerControls;
    private lightsFolder: GUI | null = null;

    constructor(
        container: HTMLElement,
        viewerRenderer: ViewerRenderer,
        viewerScene: ViewerScene,
        envManager: EnvironmentManager,
        lightsManager: LightsManager,
        controls: ViewerControls
    ) {
        this.viewerRenderer = viewerRenderer;
        this.viewerScene = viewerScene;
        this.envManager = envManager;
        this.lightsManager = lightsManager;
        this.controls = controls;
        this.params = { ...defaultParams };
        this.gui = new GUI({ container, title: 'Settings' });
        this.gui.domElement.classList.add('viewer-gui');

        // Make the Settings title completely non-collapsible
        // Force the GUI to stay open
        this.gui.open();

        // Access the internal title element via $title property
        const guiAny = this.gui as unknown as { $title: HTMLElement; _onTitleClick: () => void };
        if (guiAny.$title) {
            // Set pointer-events to none to prevent all clicks
            guiAny.$title.style.pointerEvents = 'none';
            guiAny.$title.style.cursor = 'default';
            // Remove background plate and border
            guiAny.$title.style.background = 'none';
            guiAny.$title.style.backgroundColor = 'transparent';
            guiAny.$title.style.border = 'none';
            guiAny.$title.style.boxShadow = 'none';
            guiAny.$title.style.outline = 'none';
        }

        // Inject a style tag to hide the ::before chevron pseudo-element
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            /* Hide chevron for root lil-gui title - using .lil-title class */
            .viewer-gui > .lil-title::before,
            .viewer-gui.lil-gui > .lil-title::before,
            .lil-gui.root > .lil-title::before,
            .lil-gui.viewer-gui > .lil-title::before,
            #gui-container .lil-gui > .lil-title::before,
            .lil-gui > .lil-title::before {
                display: none !important;
                content: "" !important;
                visibility: hidden !important;
                width: 0 !important;
                height: 0 !important;
                font-size: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                opacity: 0 !important;
            }
            /* Also remove background from root title */
            .viewer-gui > .lil-title,
            .lil-gui.viewer-gui > .lil-title {
                background: transparent !important;
                border: none !important;
            }
        `;
        document.head.appendChild(styleEl);

        // Override the internal title click handler if it exists
        if (typeof guiAny._onTitleClick === 'function') {
            guiAny._onTitleClick = () => { }; // No-op
        }

        this.setupRendererFolder();
        this.setupSceneFolder();
        this.setupEnvironmentFolder();
        this.setupShadowsFolder();
        this.setupLightsFolder();
        this.setupControlsFolder();
        this.setupMaterialFolder();
        this.setupExportFolder();
    }

    private setupExportFolder(): void {
        const folder = this.gui.addFolder('💾 Export/Import');

        const actions = {
            exportJSON: () => this.exportToJSON(),
            importJSON: () => this.importFromJSON(),
            copyToClipboard: () => this.copyToClipboard(),
        };

        folder.add(actions, 'exportJSON').name('📥 Download JSON');
        folder.add(actions, 'copyToClipboard').name('📋 Copy to Clipboard');
        folder.add(actions, 'importJSON').name('📤 Import JSON');

        folder.close();
    }

    private exportToJSON(): void {
        const data = this.getExportData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `viewer-settings-${Date.now()}.json`;
        link.click();

        URL.revokeObjectURL(url);
        console.log('📥 Settings exported to JSON');
    }

    private copyToClipboard(): void {
        const data = this.getExportData();
        const json = JSON.stringify(data, null, 2);

        navigator.clipboard.writeText(json).then(() => {
            console.log('📋 Settings copied to clipboard');
            alert('Settings copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    private importFromJSON(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string);
                    this.applyImportedData(data);
                    console.log('📤 Settings imported from JSON');
                } catch (err) {
                    console.error('Failed to import:', err);
                    alert('Failed to parse JSON file');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    private getExportData(): Record<string, unknown> {
        const camera = this.controls.controls.object as THREE.PerspectiveCamera;
        const lights = this.lightsManager.getLights().map(l => ({
            name: l.config.name,
            type: l.config.type,
            color: '#' + new THREE.Color(l.config.color).getHexString(),
            intensity: l.config.intensity,
            position: l.light.position.toArray(),
            castShadow: l.light.castShadow,
        }));

        return {
            version: '1.0',
            timestamp: new Date().toISOString(),
            params: { ...this.params },
            camera: {
                position: camera.position.toArray(),
                target: this.controls.controls.target.toArray(),
                fov: camera.fov,
                near: camera.near,
                far: camera.far,
            },
            lights,
        };
    }

    private applyImportedData(data: Record<string, unknown>): void {
        if (data.params) {
            const importedParams = data.params as Partial<GUIParams>;

            // Apply each parameter
            if (importedParams.toneMapping !== undefined) {
                this.params.toneMapping = importedParams.toneMapping;
                this.viewerRenderer.setToneMapping(TONE_MAPPING_OPTIONS[this.params.toneMapping]);
            }
            if (importedParams.exposure !== undefined) {
                this.params.exposure = importedParams.exposure;
                this.viewerRenderer.setExposure(this.params.exposure);
            }
            if (importedParams.noiseEnabled !== undefined) {
                this.params.noiseEnabled = importedParams.noiseEnabled;
                this.viewerRenderer.setNoiseEnabled(this.params.noiseEnabled);
            }
            if (importedParams.noiseIntensity !== undefined) {
                this.params.noiseIntensity = importedParams.noiseIntensity;
                this.viewerRenderer.setNoiseIntensity(this.params.noiseIntensity);
            }
            if (importedParams.showGrid !== undefined) {
                this.params.showGrid = importedParams.showGrid;
                this.viewerScene.toggleGrid(this.params.showGrid);
            }
            if (importedParams.showAxes !== undefined) {
                this.params.showAxes = importedParams.showAxes;
                this.viewerScene.toggleAxes(this.params.showAxes);
            }
            if (importedParams.autoRotate !== undefined) {
                this.params.autoRotate = importedParams.autoRotate;
                this.controls.setAutoRotate(this.params.autoRotate);
            }
            if (importedParams.autoRotateSpeed !== undefined) {
                this.params.autoRotateSpeed = importedParams.autoRotateSpeed;
                this.controls.setAutoRotateSpeed(this.params.autoRotateSpeed);
            }
        }

        // Update GUI controllers
        this.gui.controllers.forEach(c => c.updateDisplay());
        this.gui.folders.forEach(f => f.controllers.forEach(c => c.updateDisplay()));

        alert('Settings imported successfully!');
    }

    private setupRendererFolder(): void {
        const folder = this.gui.addFolder('🎬 Renderer');

        folder
            .add(this.params, 'toneMapping', Object.keys(TONE_MAPPING_OPTIONS))
            .name('Tone Mapping')
            .onChange((value: string) => {
                this.viewerRenderer.setToneMapping(TONE_MAPPING_OPTIONS[value]);
            });

        folder
            .add(this.params, 'exposure', 0.1, 5, 0.1)
            .name('Exposure')
            .onChange((value: number) => {
                this.viewerRenderer.setExposure(value);
            });

        folder
            .add(this.params, 'noiseEnabled')
            .name('Film Grain')
            .onChange((value: boolean) => {
                this.viewerRenderer.setNoiseEnabled(value);
            });

        folder
            .add(this.params, 'noiseIntensity', 0, 0.3, 0.01)
            .name('Grain Intensity')
            .onChange((value: number) => {
                this.viewerRenderer.setNoiseIntensity(value);
            });

        folder.close();
    }

    private setupSceneFolder(): void {
        const folder = this.gui.addFolder('🎭 Scene');

        folder
            .add(this.params, 'showGrid')
            .name('Grid')
            .onChange((value: boolean) => {
                this.viewerScene.toggleGrid(value);
            });

        folder
            .add(this.params, 'showAxes')
            .name('Axes')
            .onChange((value: boolean) => {
                this.viewerScene.toggleAxes(value);
            });

        folder
            .addColor(this.params, 'backgroundColor')
            .name('Background')
            .onChange((value: string) => {
                this.envManager.setBackgroundColor(value);
            });

        folder.close();
    }

    private setupEnvironmentFolder(): void {
        const folder = this.gui.addFolder('🌍 Environment');

        folder
            .add(this.params, 'envEnabled')
            .name('IBL Enabled')
            .onChange((value: boolean) => {
                this.envManager.setEnabled(value);
            });

        folder
            .add(this.params, 'envIntensity', 0, 3, 0.1)
            .name('HDR/IBL Intensity')
            .onChange((value: number) => {
                this.envManager.setIntensity(value);
                // Also update material envMapIntensity for consistency
                this.updateAllMaterialsEnvIntensity(value);
            });

        folder
            .add(this.params, 'backgroundMode', ['none', 'color', 'hdri'])
            .name('BG Mode')
            .onChange((value: string) => {
                this.envManager.setBackgroundMode(value as BackgroundMode);
            });

        folder.close();
    }

    private setupShadowsFolder(): void {
        const folder = this.gui.addFolder('🌑 Shadows');

        folder
            .add(this.params, 'shadowsEnabled')
            .name('Enabled')
            .onChange((value: boolean) => {
                this.lightsManager.setShadowsEnabled(value);
            });

        folder
            .add(this.params, 'shadowIntensity', 0, 1, 0.05)
            .name('Intensity')
            .onChange((value: number) => {
                this.lightsManager.setShadowIntensity(value);
            });

        folder
            .add(this.params, 'shadowSoftness', 0, 10, 0.5)
            .name('Softness')
            .onChange((value: number) => {
                this.lightsManager.setShadowSoftness(value);
            });

        folder
            .add(this.params, 'shadowGroundVisible')
            .name('Ground Plane')
            .onChange((value: boolean) => {
                this.lightsManager.setGroundVisible(value);
            });

        folder.close();
    }

    private setupLightsFolder(): void {
        this.lightsFolder = this.gui.addFolder('💡 Lights');

        const addLightBtn = {
            addDirectional: () => this.addNewLight('directional'),
            addSpot: () => this.addNewLight('spot'),
        };

        this.lightsFolder.add(addLightBtn, 'addDirectional').name('+ Directional');
        this.lightsFolder.add(addLightBtn, 'addSpot').name('+ Spot');

        // Add existing lights
        this.refreshLightsUI();
        this.lightsFolder.close();
    }

    private addNewLight(type: LightType): void {
        const count = this.lightsManager.getLights().length;
        const id = this.lightsManager.addLight({
            type,
            name: `${type} ${count + 1}`,
            color: 0xffffff,
            intensity: 1.0,
            position: new THREE.Vector3(3, 3, 3),
            castShadow: type !== 'point',
        });
        this.refreshLightsUI();
    }

    private refreshLightsUI(): void {
        if (!this.lightsFolder) return;

        // Remove existing light folders (keep the add buttons)
        const controllers = [...this.lightsFolder.controllers];
        const folders = [...this.lightsFolder.folders];
        folders.forEach((f) => f.destroy());

        // Re-add light controls
        const lights = this.lightsManager.getLights();
        lights.forEach((managed) => {
            this.addLightControlsToFolder(managed);
        });
    }

    private addLightControlsToFolder(managed: ManagedLight): void {
        if (!this.lightsFolder) return;

        const folder = this.lightsFolder.addFolder(`${managed.config.name}`);

        const lightParams = {
            color: '#' + new THREE.Color(managed.config.color).getHexString(),
            intensity: managed.config.intensity,
            castShadow: managed.config.castShadow ?? false,
            remove: () => {
                this.lightsManager.removeLight(managed.id);
                folder.destroy();
            },
        };

        folder.addColor(lightParams, 'color').name('Color').onChange((value: string) => {
            this.lightsManager.updateLight(managed.id, { color: value });
        });

        folder.add(lightParams, 'intensity', 0, 10, 0.1).name('Intensity').onChange((value: number) => {
            this.lightsManager.updateLight(managed.id, { intensity: value });
        });

        if (managed.config.type !== 'ambient' && managed.config.type !== 'hemisphere') {
            folder.add(lightParams, 'castShadow').name('Shadow').onChange((value: boolean) => {
                managed.light.castShadow = value;
            });
        }

        folder.add(lightParams, 'remove').name('🗑️ Remove');
        folder.close();
    }

    private setupControlsFolder(): void {
        const folder = this.gui.addFolder('🎮 Controls');

        folder
            .add(this.params, 'autoRotate')
            .name('Auto Rotate')
            .onChange((value: boolean) => {
                this.controls.setAutoRotate(value);
            });

        folder
            .add(this.params, 'autoRotateSpeed', 0.5, 10, 0.5)
            .name('Rotate Speed')
            .onChange((value: number) => {
                this.controls.setAutoRotateSpeed(value);
            });

        folder.close();
    }

    private setupMaterialFolder(): void {
        const folder = this.gui.addFolder('🎨 Materials');

        folder
            .add(this.params, 'overrideMaterials')
            .name('Override')
            .onChange((value: boolean) => {
                this.applyMaterialOverrides();
            });

        folder
            .add(this.params, 'metalness', 0, 1, 0.01)
            .name('Metalness')
            .onChange(() => this.applyMaterialOverrides());

        folder
            .add(this.params, 'roughness', 0, 1, 0.01)
            .name('Roughness')
            .onChange(() => this.applyMaterialOverrides());

        folder.close();
    }

    private applyMaterialOverrides(): void {
        const model = this.viewerScene.getCurrentModel();
        if (!model) return;

        model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                        if (this.params.overrideMaterials) {
                            mat.metalness = this.params.metalness;
                            mat.roughness = this.params.roughness;
                        }
                        mat.needsUpdate = true;
                    }
                });
            }
        });
    }

    private updateAllMaterialsEnvIntensity(intensity: number): void {
        const model = this.viewerScene.getCurrentModel();
        if (!model) return;

        model.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach((mat) => {
                    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                        mat.envMapIntensity = intensity;
                        mat.needsUpdate = true;
                    }
                });
            }
        });
    }

    public dispose(): void {
        this.gui.destroy();
    }
}
