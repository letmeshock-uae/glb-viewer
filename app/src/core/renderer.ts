import * as THREE from 'three';
import { EffectComposer, EffectPass, RenderPass, NoiseEffect, BlendFunction } from 'postprocessing';

export interface RendererConfig {
    antialias: boolean;
    alpha: boolean;
    toneMapping: THREE.ToneMapping;
    toneMappingExposure: number;
    castShadow: boolean;
    noiseEnabled: boolean;
    noiseIntensity: number;
}

export const defaultRendererConfig: RendererConfig = {
    antialias: true,
    alpha: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0,
    castShadow: true,
    noiseEnabled: true,
    noiseIntensity: 0.08,
};

export class ViewerRenderer {
    public renderer: THREE.WebGLRenderer;
    private container: HTMLElement;
    private composer: EffectComposer | null = null;
    private renderPass: RenderPass | null = null;
    private noiseEffect: NoiseEffect | null = null;
    private noisePass: EffectPass | null = null;
    private noiseEnabled: boolean = true;
    private noiseIntensity: number = 0.08;

    constructor(container: HTMLElement, config: Partial<RendererConfig> = {}) {
        const finalConfig = { ...defaultRendererConfig, ...config };
        this.container = container;
        this.noiseEnabled = finalConfig.noiseEnabled;
        this.noiseIntensity = finalConfig.noiseIntensity;

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
        // Dispose old composer if exists
        if (this.composer) {
            this.composer.dispose();
        }

        // Create effect composer
        this.composer = new EffectComposer(this.renderer);

        // Add render pass
        this.renderPass = new RenderPass(scene, camera);
        this.composer.addPass(this.renderPass);

        // Add noise effect
        this.noiseEffect = new NoiseEffect({
            blendFunction: BlendFunction.OVERLAY,
            premultiply: true,
        });
        this.noiseEffect.blendMode.opacity.value = this.noiseIntensity;

        this.noisePass = new EffectPass(camera, this.noiseEffect);
        this.noisePass.enabled = this.noiseEnabled;
        this.composer.addPass(this.noisePass);
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

    public setNoiseEnabled(enabled: boolean): void {
        this.noiseEnabled = enabled;
        if (this.noisePass) {
            this.noisePass.enabled = enabled;
        }
    }

    public setNoiseIntensity(intensity: number): void {
        this.noiseIntensity = intensity;
        if (this.noiseEffect) {
            this.noiseEffect.blendMode.opacity.value = intensity;
        }
    }

    public isNoiseEnabled(): boolean {
        return this.noiseEnabled;
    }

    public takeScreenshot(filename: string = 'screenshot.png'): void {
        const dataURL = this.renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = filename;
        link.click();
    }

    public render(scene: THREE.Scene, camera: THREE.Camera): void {
        // Initialize or update composer
        if (!this.composer) {
            this.setupPostProcessing(scene, camera);
        } else if (this.renderPass) {
            // Update scene and camera references for render pass
            this.renderPass.mainScene = scene;
            this.renderPass.mainCamera = camera;
        }

        // Update noise pass camera if needed
        if (this.noisePass && this.noisePass.mainCamera !== camera) {
            this.noisePass.mainCamera = camera;
        }

        if (this.composer && this.noiseEnabled) {
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
