import * as THREE from 'three';

export interface SceneConfig {
    backgroundColor: THREE.ColorRepresentation;
    showGrid: boolean;
    showAxes: boolean;
    gridSize: number;
    gridDivisions: number;
}

export const defaultSceneConfig: SceneConfig = {
    backgroundColor: 0x1a1a2e,
    showGrid: true,
    showAxes: true,
    gridSize: 10,
    gridDivisions: 10,
};

export class ViewerScene {
    public scene: THREE.Scene;
    private gridHelper: THREE.GridHelper | null = null;
    private axesHelper: THREE.AxesHelper | null = null;
    private config: SceneConfig;
    private currentModel: THREE.Object3D | null = null;

    constructor(config: Partial<SceneConfig> = {}) {
        this.config = { ...defaultSceneConfig, ...config };
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.backgroundColor);

        if (this.config.showGrid) this.addGrid();
        if (this.config.showAxes) this.addAxes();
    }

    public addGrid(): void {
        if (this.gridHelper) return;
        this.gridHelper = new THREE.GridHelper(
            this.config.gridSize,
            this.config.gridDivisions,
            0x444466,
            0x333355
        );
        this.gridHelper.position.y = 0;
        this.scene.add(this.gridHelper);
    }

    public removeGrid(): void {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper.dispose();
            this.gridHelper = null;
        }
    }

    public toggleGrid(show?: boolean): void {
        const shouldShow = show ?? !this.gridHelper;
        if (shouldShow) {
            this.addGrid();
        } else {
            this.removeGrid();
        }
    }

    public addAxes(): void {
        if (this.axesHelper) return;
        this.axesHelper = new THREE.AxesHelper(this.config.gridSize / 2);
        this.scene.add(this.axesHelper);
    }

    public removeAxes(): void {
        if (this.axesHelper) {
            this.scene.remove(this.axesHelper);
            this.axesHelper.dispose();
            this.axesHelper = null;
        }
    }

    public toggleAxes(show?: boolean): void {
        const shouldShow = show ?? !this.axesHelper;
        if (shouldShow) {
            this.addAxes();
        } else {
            this.removeAxes();
        }
    }

    public setBackgroundColor(color: THREE.ColorRepresentation): void {
        this.scene.background = new THREE.Color(color);
    }

    public setBackgroundTexture(texture: THREE.Texture | null): void {
        this.scene.background = texture;
    }

    public addModel(model: THREE.Object3D): void {
        if (this.currentModel) {
            this.removeModel();
        }
        this.currentModel = model;
        this.scene.add(model);
        console.log('✅ Model added to scene. Scene children count:', this.scene.children.length);
    }

    public removeModel(): void {
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.disposeObject(this.currentModel);
            this.currentModel = null;
        }
    }

    public getCurrentModel(): THREE.Object3D | null {
        return this.currentModel;
    }

    private disposeObject(obj: THREE.Object3D): void {
        obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m) => this.disposeMaterial(m));
                    } else {
                        this.disposeMaterial(child.material);
                    }
                }
            }
        });
    }

    private disposeMaterial(material: THREE.Material): void {
        material.dispose();
        // Dispose textures if any
        const mat = material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.dispose();
        if (mat.normalMap) mat.normalMap.dispose();
        if (mat.roughnessMap) mat.roughnessMap.dispose();
        if (mat.metalnessMap) mat.metalnessMap.dispose();
        if (mat.aoMap) mat.aoMap.dispose();
        if (mat.emissiveMap) mat.emissiveMap.dispose();
    }

    public reset(): void {
        this.removeModel();
        this.scene.background = new THREE.Color(this.config.backgroundColor);
    }

    public getBoundingBox(): THREE.Box3 | null {
        if (!this.currentModel) return null;
        const box = new THREE.Box3().setFromObject(this.currentModel);
        return box;
    }
}
