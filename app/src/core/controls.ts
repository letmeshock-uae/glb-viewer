import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface ControlsConfig {
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    enablePan: boolean;
    enableRotate: boolean;
    minDistance: number;
    maxDistance: number;
    autoRotate: boolean;
    autoRotateSpeed: number;
}

export const defaultControlsConfig: ControlsConfig = {
    enableDamping: true,
    dampingFactor: 0.1,
    enableZoom: true,
    enablePan: true,
    enableRotate: true,
    minDistance: 0.001,
    maxDistance: 10000,
    autoRotate: false,
    autoRotateSpeed: 2.0,
};

export class ViewerControls {
    public controls: OrbitControls;
    private defaultTarget: THREE.Vector3;

    constructor(
        camera: THREE.Camera,
        domElement: HTMLElement,
        config: Partial<ControlsConfig> = {}
    ) {
        const finalConfig = { ...defaultControlsConfig, ...config };

        this.controls = new OrbitControls(camera, domElement);

        this.controls.enableDamping = finalConfig.enableDamping;
        this.controls.dampingFactor = finalConfig.dampingFactor;
        this.controls.enableZoom = finalConfig.enableZoom;
        this.controls.enablePan = finalConfig.enablePan;
        this.controls.enableRotate = finalConfig.enableRotate;
        this.controls.minDistance = finalConfig.minDistance;
        this.controls.maxDistance = finalConfig.maxDistance;
        this.controls.autoRotate = finalConfig.autoRotate;
        this.controls.autoRotateSpeed = finalConfig.autoRotateSpeed;

        this.defaultTarget = this.controls.target.clone();
    }

    public setTarget(target: THREE.Vector3): void {
        this.controls.target.copy(target);
        this.controls.update();
    }

    public reset(): void {
        this.controls.target.copy(this.defaultTarget);
        this.controls.update();
    }

    public update(): void {
        this.controls.update();
    }

    public setAutoRotate(enabled: boolean): void {
        this.controls.autoRotate = enabled;
    }

    public setAutoRotateSpeed(speed: number): void {
        this.controls.autoRotateSpeed = speed;
    }

    public dispose(): void {
        this.controls.dispose();
    }
}
