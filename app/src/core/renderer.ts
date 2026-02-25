import * as THREE from 'three';
import { EffectComposer, EffectPass, RenderPass, BrightnessContrastEffect, HueSaturationEffect } from 'postprocessing';

export interface RendererConfig {
    antialias: boolean;
    alpha: boolean;
    toneMapping: THREE.ToneMapping;
    toneMappingExposure: number;
    castShadow: boolean;
    contrast: number;
    saturation: number;
}

export const defaultRendererConfig: RendererConfig = {
    antialias: true,
    alpha: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0,
    castShadow: true,
    contrast: 0.0,
    saturation: 0.0,
};

export class ViewerRenderer {
    public renderer: THREE.WebGLRenderer;
    private container: HTMLElement;
    private composer: EffectComposer | null = null;
    private renderPass: RenderPass | null = null;

    private colorGradingPass: EffectPass | null = null;
    private brightnessContrastEffect: BrightnessContrastEffect | null = null;
    private hueSaturationEffect: HueSaturationEffect | null = null;

    private contrast: number = 0.0;
    private saturation: number = 0.0;

    constructor(container: HTMLElement, config: Partial<RendererConfig> = {}) {
        const finalConfig = { ...defaultRendererConfig, ...config };
        this.container = container;
        this.contrast = finalConfig.contrast;
        this.saturation = finalConfig.saturation;

        this.renderer = new THREE.WebGLRenderer({
            antialias: finalConfig.antialias,
            alpha: finalConfig.alpha,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
        });

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = finalConfig.toneMapping;
        this.renderer.toneMappingExposure = finalConfig.toneMappingExposure;
        this.renderer.shadowMap.enabled = finalConfig.castShadow;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        container.appendChild(this.renderer.domElement);

        window.addEventListener('resize', this.onResize.bind(this));
    }

    private setupPostProcessing(scene: THREE.Scene, camera: THREE.Camera): void {
        if (this.composer) {
            this.composer.dispose();
        }

        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(scene, camera);
        this.composer.addPass(this.renderPass);

        this.brightnessContrastEffect = new BrightnessContrastEffect();
        this.brightnessContrastEffect.contrast = this.contrast;

        this.hueSaturationEffect = new HueSaturationEffect();
        this.hueSaturationEffect.saturation = this.saturation;

        this.colorGradingPass = new EffectPass(camera, this.brightnessContrastEffect, this.hueSaturationEffect);
        this.composer.addPass(this.colorGradingPass);
    }

    private onResize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.renderer.setSize(width, height);

        if (this.composer) {
            this.composer.setSize(width, height);
        }
    }

    public setToneMapping(toneMapping: THREE.ToneMapping): void {
        this.renderer.toneMapping = toneMapping;
    }

    public setExposure(exposure: number): void {
        this.renderer.toneMappingExposure = exposure;
    }

    public setContrast(contrast: number): void {
        this.contrast = contrast;
        if (this.brightnessContrastEffect) {
            this.brightnessContrastEffect.contrast = contrast;
        }
    }

    public setSaturation(saturation: number): void {
        this.saturation = saturation;
        if (this.hueSaturationEffect) {
            this.hueSaturationEffect.saturation = saturation;
        }
    }

    public takeScreenshot(filename: string = 'screenshot.png'): void {
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename;
        link.click();
    }

    public render(scene: THREE.Scene, camera: THREE.Camera): void {
        if (!this.composer) {
            this.setupPostProcessing(scene, camera);
        } else if (this.renderPass) {
            this.renderPass.mainScene = scene;
            this.renderPass.mainCamera = camera;
        }

        if (this.colorGradingPass && this.colorGradingPass.mainCamera !== camera) {
            this.colorGradingPass.mainCamera = camera;
        }

        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(scene, camera);
        }
    }

    public dispose(): void {
        window.removeEventListener('resize', this.onResize.bind(this));
        if (this.composer) {
            this.composer.dispose();
        }
        this.renderer.dispose();
        this.container.removeChild(this.renderer.domElement);
    }

    public getSize(): { width: number; height: number } {
        return {
            width: this.container.clientWidth,
            height: this.container.clientHeight,
        };
    }
}
