import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export type BackgroundMode = 'none' | 'color' | 'hdri';

export interface EnvConfig {
    enabled: boolean;
    intensity: number;
    rotation: number;
    backgroundMode: BackgroundMode;
    backgroundColor: THREE.ColorRepresentation;
}

export const defaultEnvConfig: EnvConfig = {
    enabled: true,
    intensity: 1.0,
    rotation: 0.0,
    backgroundMode: 'color',
    backgroundColor: 0x1a1a2e,
};

export interface HDRIPreset {
    name: string;
    url: string;
}

// Embedded procedural environment - no external HDRI files needed
export class EnvironmentManager {
    private pmremGenerator: THREE.PMREMGenerator;
    private scene: THREE.Scene;
    private config: EnvConfig;
    private currentEnvMap: THREE.Texture | null = null;
    private rgbeLoader: RGBELoader;

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, config: Partial<EnvConfig> = {}) {
        this.config = { ...defaultEnvConfig, ...config };
        this.scene = scene;
        this.pmremGenerator = new THREE.PMREMGenerator(renderer);
        this.pmremGenerator.compileEquirectangularShader();
        this.rgbeLoader = new RGBELoader();

        // Initialize with procedural environment
        this.createProceduralEnvironment();
    }

    private createProceduralEnvironment(): void {
        // Create a gradient environment map procedurally
        const envScene = new THREE.Scene();

        // Sky gradient using a large sphere with shader material
        const skyGeo = new THREE.SphereGeometry(50, 32, 16);
        const skyMat = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
            fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `
        });

        const sky = new THREE.Mesh(skyGeo, skyMat);
        envScene.add(sky);

        // Add hemisphere light to the env scene
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        envScene.add(hemiLight);

        // Generate environment map from scene
        this.currentEnvMap = this.pmremGenerator.fromScene(envScene).texture;

        if (this.config.enabled) {
            this.scene.environment = this.currentEnvMap;
        }

        // Clean up
        skyGeo.dispose();
        skyMat.dispose();
    }

    public async loadHDRI(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.rgbeLoader.load(
                url,
                (texture) => {
                    const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
                    texture.dispose();

                    if (this.currentEnvMap) {
                        this.currentEnvMap.dispose();
                    }

                    this.currentEnvMap = envMap;

                    if (this.config.enabled) {
                        this.scene.environment = envMap;
                        if (this.config.backgroundMode === 'hdri') {
                            this.scene.background = envMap;
                        }
                    }

                    resolve();
                },
                undefined,
                reject
            );
        });
    }

    public setEnabled(enabled: boolean): void {
        this.config.enabled = enabled;
        if (enabled && this.currentEnvMap) {
            this.scene.environment = this.currentEnvMap;
        } else {
            this.scene.environment = null;
        }
    }

    public setIntensity(intensity: number): void {
        this.config.intensity = intensity;

        // Modern Three.js way (r163+)
        if ('environmentIntensity' in this.scene) {
            (this.scene as any).environmentIntensity = intensity;
        }

        if ('backgroundIntensity' in this.scene && this.config.backgroundMode === 'hdri') {
            (this.scene as any).backgroundIntensity = intensity;
        }

        // Fallback: Apply intensity to all materials in scene
        this.scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh && obj.material) {
                const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                materials.forEach((mat) => {
                    if ('envMapIntensity' in mat) {
                        (mat as THREE.MeshStandardMaterial).envMapIntensity = intensity;
                    }
                });
            }
        });
    }

    public setRotation(rotationY: number): void {
        this.config.rotation = rotationY;
        if ('environmentRotation' in this.scene) {
            this.scene.environmentRotation.y = rotationY;
        }
        if ('backgroundRotation' in this.scene) {
            this.scene.backgroundRotation.y = rotationY;
        }
    }

    public setBackgroundMode(mode: BackgroundMode): void {
        this.config.backgroundMode = mode;
        switch (mode) {
            case 'none':
                this.scene.background = null;
                break;
            case 'color':
                this.scene.background = new THREE.Color(this.config.backgroundColor);
                break;
            case 'hdri':
                if (this.currentEnvMap) {
                    this.scene.background = this.currentEnvMap;
                }
                break;
        }
    }

    public setBackgroundColor(color: THREE.ColorRepresentation): void {
        this.config.backgroundColor = color;
        if (this.config.backgroundMode === 'color') {
            this.scene.background = new THREE.Color(color);
        }
    }

    public dispose(): void {
        if (this.currentEnvMap) {
            this.currentEnvMap.dispose();
        }
        this.pmremGenerator.dispose();
    }
}
