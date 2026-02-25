import GUI from 'lil-gui';
import * as THREE from 'three';
import { ToneMappingMode } from 'postprocessing';
import { ViewerRenderer } from '../core/renderer';
import { ViewerScene } from '../core/scene';
import { EnvironmentManager, type BackgroundMode } from '../core/env';
import { LightsManager, type LightType, type ManagedLight } from '../core/lights';
import { ViewerControls } from '../core/controls';

export interface GUIParams {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    highlights: number;
    shadows: number;
    envIntensity: number;
    envRotation: number;
    toneMappingMode: number;
    sunLightEnabled: boolean;
    sunLightColor: string;
    sunLightIntensity: number;
    sunLightElevation: number;
    sunLightAzimuth: number;
}

const defaultParams: GUIParams = {
    exposure: 1.0,
    contrast: 0.0,
    saturation: 0.0,
    temperature: 0.0,
    tint: 0.0,
    highlights: 1.0,
    shadows: 1.0,
    envIntensity: 1.0,
    envRotation: 0.0,
    toneMappingMode: ToneMappingMode.ACES_FILMIC,
    sunLightEnabled: true,
    sunLightColor: '#ffffff',
    sunLightIntensity: 2.0,
    sunLightElevation: Math.PI / 4,
    sunLightAzimuth: Math.PI / 4,
};

export interface GUIActions {
    onOpen: () => void;
    onReset: () => void;
    onFit: () => void;
    onToggleGrid: () => void;
    onToggleAxes: () => void;
    onScreenshot: () => void;
}

export class ViewerGUI {
    private gui: GUI;
    private params: GUIParams;
    private viewerRenderer: ViewerRenderer;
    private envManager: EnvironmentManager;
    private lightsManager: LightsManager;
    private actions: GUIActions;

    constructor(
        container: HTMLElement,
        viewerRenderer: ViewerRenderer,
        envManager: EnvironmentManager,
        lightsManager: LightsManager,
        actions: GUIActions
    ) {
        this.viewerRenderer = viewerRenderer;
        this.envManager = envManager;
        this.lightsManager = lightsManager;
        this.actions = actions;

        this.params = { ...defaultParams };
        this.gui = new GUI({ container, title: 'Controls' });
        this.gui.domElement.classList.add('viewer-gui');

        this.gui.open();

        this.setupToolbarActions();
        this.setupEnvironmentAndLight();
        this.setupColorGrading();
        this.setupExportFolder();
    }

    private setupToolbarActions(): void {
        const folder = this.gui.addFolder('🛠 Tools');

        folder.add(this.actions, 'onOpen').name('📁 Open File');
        folder.add(this.actions, 'onReset').name('🔄 Reset Scene');
        folder.add(this.actions, 'onFit').name('🔍 Fit Model');
        folder.add(this.actions, 'onToggleGrid').name('📏 Toggle Grid');
        folder.add(this.actions, 'onToggleAxes').name('🧭 Toggle Axes');
        folder.add(this.actions, 'onScreenshot').name('📸 Screenshot');
    }

    private setupColorGrading(): void {
        const folder = this.gui.addFolder('🎨 Color & Light');

        folder.add(this.params, 'toneMappingMode', {
            'ACES Filmic': ToneMappingMode.ACES_FILMIC,
            'Reinhard': ToneMappingMode.REINHARD,
            'Reinhard2': ToneMappingMode.REINHARD2,
            'Reinhard2_Adaptive': ToneMappingMode.REINHARD2_ADAPTIVE,
            'Optimized Cineon': ToneMappingMode.OPTIMIZED_CINEON,
            'AgX': ToneMappingMode.AGX,
            'Neutral': ToneMappingMode.NEUTRAL
        }).name('Tone Mapping')
            .onChange((value: number) => {
                this.viewerRenderer.setToneMappingMode(value);
            });

        folder
            .add(this.params, 'exposure', 0.1, 5, 0.1)
            .name('Exposure')
            .onChange((value: number) => {
                this.viewerRenderer.setExposure(value);
            });

        folder
            .add(this.params, 'contrast', -1, 1, 0.05)
            .name('Contrast')
            .onChange((value: number) => {
                this.viewerRenderer.setContrast(value);
            });

        folder
            .add(this.params, 'saturation', -1, 1, 0.05)
            .name('Saturation')
            .onChange((value: number) => {
                this.viewerRenderer.setSaturation(value);
            });

        folder
            .add(this.params, 'temperature', -1, 1, 0.05)
            .name('Temperature')
            .onChange((value: number) => {
                this.viewerRenderer.setTemperature(value);
            });

        folder
            .add(this.params, 'tint', -1, 1, 0.05)
            .name('Tint')
            .onChange((value: number) => {
                this.viewerRenderer.setTint(value);
            });

        folder
            .add(this.params, 'highlights', 0, 2, 0.05)
            .name('Highlights')
            .onChange((value: number) => {
                this.viewerRenderer.setHighlights(value);
            });

        folder
            .add(this.params, 'shadows', 0, 2, 0.05)
            .name('Shadows')
            .onChange((value: number) => {
                this.viewerRenderer.setShadows(value);
            });
    }

    private sunLightId: string | null = null;

    private setupEnvironmentAndLight(): void {
        const folder = this.gui.addFolder('☀️ Environment & Light');

        // Environment
        folder.add(this.params, 'envIntensity', 0, 5, 0.1).name('HDRI Intensity').onChange((v: number) => this.envManager.setIntensity(v));
        folder.add(this.params, 'envRotation', 0, Math.PI * 2, 0.01).name('HDRI Rotation').onChange((v: number) => this.envManager.setRotation(v));

        // Sun Light
        folder.add(this.params, 'sunLightEnabled').name('Enable Sun').onChange(() => this.updateSunLight());
        folder.addColor(this.params, 'sunLightColor').name('Sun Color').onChange(() => this.updateSunLight());
        folder.add(this.params, 'sunLightIntensity', 0, 10, 0.1).name('Sun Intensity').onChange(() => this.updateSunLight());
        folder.add(this.params, 'sunLightElevation', 0, Math.PI / 2, 0.01).name('Sun Elevation').onChange(() => this.updateSunLight());
        folder.add(this.params, 'sunLightAzimuth', 0, Math.PI * 2, 0.01).name('Sun Azimuth').onChange(() => this.updateSunLight());

        // Initialize Sun Light
        this.updateSunLight();
    }

    private updateSunLight(): void {
        if (!this.params.sunLightEnabled) {
            if (this.sunLightId) {
                this.lightsManager.removeLight(this.sunLightId);
                this.sunLightId = null;
            }
        } else {
            const config = {
                type: 'directional' as LightType,
                name: 'Sun',
                color: this.params.sunLightColor,
                intensity: this.params.sunLightIntensity,
                elevation: this.params.sunLightElevation,
                azimuth: this.params.sunLightAzimuth,
                castShadow: true
            };
            if (!this.sunLightId) {
                this.sunLightId = this.lightsManager.addLight(config);
            } else {
                this.lightsManager.updateLight(this.sunLightId, config);
            }
        }
    }

    private setupExportFolder(): void {
        const folder = this.gui.addFolder('💾 Presets');

        const actions = {
            exportJSON: () => this.exportToJSON(),
            importJSON: () => this.importFromJSON(),
            copyToClipboard: () => this.copyToClipboard(),
            reset: () => this.resetParams(),
        };

        folder.add(actions, 'exportJSON').name('📥 Download JSON');
        folder.add(actions, 'copyToClipboard').name('📋 Copy to Clipboard');
        folder.add(actions, 'importJSON').name('📤 Import JSON');
        folder.add(actions, 'reset').name('🔄 Reset Default');

        folder.close();
    }

    private resetParams(): void {
        Object.assign(this.params, defaultParams);

        this.viewerRenderer.setExposure(this.params.exposure);
        this.viewerRenderer.setContrast(this.params.contrast);
        this.viewerRenderer.setSaturation(this.params.saturation);
        this.viewerRenderer.setTemperature(this.params.temperature);
        this.viewerRenderer.setTint(this.params.tint);
        this.viewerRenderer.setHighlights(this.params.highlights);
        this.viewerRenderer.setShadows(this.params.shadows);
        this.viewerRenderer.setToneMappingMode(this.params.toneMappingMode);

        this.envManager.setIntensity(this.params.envIntensity);
        this.envManager.setRotation(this.params.envRotation);
        this.updateSunLight();

        this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    }

    private exportToJSON(): void {
        const json = JSON.stringify({ version: '2.0', params: this.params }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `color-preset-${Date.now()}.json`;
        link.click();

        URL.revokeObjectURL(url);
    }

    private copyToClipboard(): void {
        const json = JSON.stringify({ version: '2.0', params: this.params }, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            alert('Settings copied to clipboard!');
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
                } catch (err) {
                    alert('Failed to parse JSON file');
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    private applyImportedData(data: Record<string, unknown>): void {
        if (data.params) {
            const importedParams = data.params as Partial<GUIParams>;

            if (importedParams.exposure !== undefined) {
                this.params.exposure = importedParams.exposure;
                this.viewerRenderer.setExposure(this.params.exposure);
            }
            if (importedParams.contrast !== undefined) {
                this.params.contrast = importedParams.contrast;
                this.viewerRenderer.setContrast(this.params.contrast);
            }
            if (importedParams.saturation !== undefined) {
                this.params.saturation = importedParams.saturation;
                this.viewerRenderer.setSaturation(this.params.saturation);
            }
            if (importedParams.temperature !== undefined) {
                this.params.temperature = importedParams.temperature;
                this.viewerRenderer.setTemperature(this.params.temperature);
            }
            if (importedParams.tint !== undefined) {
                this.params.tint = importedParams.tint;
                this.viewerRenderer.setTint(this.params.tint);
            }
            if (importedParams.envIntensity !== undefined) {
                this.params.envIntensity = importedParams.envIntensity;
                this.envManager.setIntensity(this.params.envIntensity);
            }
            if (importedParams.highlights !== undefined) {
                this.params.highlights = importedParams.highlights;
                this.viewerRenderer.setHighlights(this.params.highlights);
            }
            if (importedParams.shadows !== undefined) {
                this.params.shadows = importedParams.shadows;
                this.viewerRenderer.setShadows(this.params.shadows);
            }
            if (importedParams.toneMappingMode !== undefined) {
                this.params.toneMappingMode = importedParams.toneMappingMode;
                this.viewerRenderer.setToneMappingMode(this.params.toneMappingMode);
            }
            if (importedParams.envRotation !== undefined) {
                this.params.envRotation = importedParams.envRotation;
                this.envManager.setRotation(this.params.envRotation);
            }
            if (importedParams.sunLightEnabled !== undefined) {
                this.params.sunLightEnabled = importedParams.sunLightEnabled;
            }
            if (importedParams.sunLightColor !== undefined) {
                this.params.sunLightColor = importedParams.sunLightColor;
            }
            if (importedParams.sunLightIntensity !== undefined) {
                this.params.sunLightIntensity = importedParams.sunLightIntensity;
            }
            if (importedParams.sunLightElevation !== undefined) {
                this.params.sunLightElevation = importedParams.sunLightElevation;
            }
            if (importedParams.sunLightAzimuth !== undefined) {
                this.params.sunLightAzimuth = importedParams.sunLightAzimuth;
            }
            this.updateSunLight();
        }

        this.gui.controllersRecursive().forEach(c => c.updateDisplay());
    }

    public dispose(): void {
        this.gui.destroy();
    }
}
