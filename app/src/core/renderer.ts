import * as THREE from 'three';
import { EffectComposer, EffectPass, RenderPass, BrightnessContrastEffect, HueSaturationEffect, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { ColorGradingEffect } from './ColorGradingEffect';

export interface RendererConfig {
    antialias: boolean;
    alpha: boolean;
    toneMapping: THREE.ToneMapping;
    toneMappingMode: ToneMappingMode; // for postprocessing
    toneMappingExposure: number;
    castShadow: boolean;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    highlights: number;
    shadows: number;
}

export const defaultRendererConfig: RendererConfig = {
    antialias: true,
    alpha: true,
    toneMapping: THREE.NoToneMapping, // Let postprocessing handle it
    toneMappingMode: ToneMappingMode.ACES_FILMIC,
    toneMappingExposure: 1.0,
    castShadow: true,
    contrast: 0.0,
    saturation: 0.0,
    temperature: 0.0,
    tint: 0.0,
    highlights: 1.0,
    shadows: 1.0,
};

export class ViewerRenderer {
    public renderer: THREE.WebGLRenderer;
    private container: HTMLElement;
    private composer: EffectComposer | null = null;
    private renderPass: RenderPass | null = null;

    private colorGradingPass: EffectPass | null = null;
    private brightnessContrastEffect: BrightnessContrastEffect | null = null;
    private hueSaturationEffect: HueSaturationEffect | null = null;
    private toneMappingEffect: ToneMappingEffect | null = null;
    private customColorGradingEffect: ColorGradingEffect | null = null;

    private contrast: number = 0.0;
    private saturation: number = 0.0;
    private temperature: number = 0.0;
    private tint: number = 0.0;
    private highlights: number = 1.0;
    private shadows: number = 1.0;
    private toneMappingMode: ToneMappingMode = ToneMappingMode.ACES_FILMIC;

    constructor(container: HTMLElement, config: Partial<RendererConfig> = {}) {
        const finalConfig = { ...defaultRendererConfig, ...config };
        this.container = container;
        this.contrast = finalConfig.contrast;
        this.saturation = finalConfig.saturation;
        this.temperature = finalConfig.temperature;
        this.tint = finalConfig.tint;
        this.highlights = finalConfig.highlights;
        this.shadows = finalConfig.shadows;
        this.toneMappingMode = finalConfig.toneMappingMode;

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

        this.customColorGradingEffect = new ColorGradingEffect();
        this.customColorGradingEffect.temperature = this.temperature;
        this.customColorGradingEffect.tint = this.tint;
        this.customColorGradingEffect.exposure = this.renderer.toneMappingExposure;
        this.customColorGradingEffect.highlights = this.highlights;
        this.customColorGradingEffect.shadows = this.shadows;

        this.toneMappingEffect = new ToneMappingEffect({ mode: this.toneMappingMode });

        this.colorGradingPass = new EffectPass(camera, this.brightnessContrastEffect, this.hueSaturationEffect, this.customColorGradingEffect, this.toneMappingEffect);
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

    public setToneMappingMode(mode: ToneMappingMode): void {
        this.toneMappingMode = mode;
        if (this.toneMappingEffect) {
            this.toneMappingEffect.mode = mode;
        }
    }

    // Keep this for any native Three.js materials if needed, but usually not with postprocessing
    public setToneMapping(toneMapping: THREE.ToneMapping): void {
        this.renderer.toneMapping = toneMapping;
    }

    public setExposure(exposure: number): void {
        this.renderer.toneMappingExposure = exposure;
        if (this.customColorGradingEffect) {
            this.customColorGradingEffect.exposure = exposure;
        }
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

    public setTemperature(temperature: number): void {
        this.temperature = temperature;
        if (this.customColorGradingEffect) {
            this.customColorGradingEffect.temperature = temperature;
        }
    }

    public setTint(tint: number): void {
        this.tint = tint;
        if (this.customColorGradingEffect) {
            this.customColorGradingEffect.tint = tint;
        }
    }

    public setHighlights(highlights: number): void {
        this.highlights = highlights;
        if (this.customColorGradingEffect) {
            this.customColorGradingEffect.highlights = highlights;
        }
    }

    public setShadows(shadows: number): void {
        this.shadows = shadows;
        if (this.customColorGradingEffect) {
            this.customColorGradingEffect.shadows = shadows;
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
