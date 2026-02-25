import GUI from 'lil-gui';
import * as THREE from 'three';
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

    // We'll keep autoRotate invisible but in params for export compatibility, or just remove it if not needed.
    // Let's keep it clean.
}

const defaultParams: GUIParams = {
    exposure: 1.0,
    contrast: 0.0,
    saturation: 0.0,
    temperature: 0.0,
    tint: 0.0,
    highlights: 1.0,
    shadows: 1.0,
};

export class ViewerGUI {
    private gui: GUI;
    private params: GUIParams;
    private viewerRenderer: ViewerRenderer;
    private viewerScene: ViewerScene;
    private envManager: EnvironmentManager;
    private lightsManager: LightsManager;
    private controls: ViewerControls;

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
        this.gui = new GUI({ container, title: 'Color Grading & Lighting' });
        this.gui.domElement.classList.add('viewer-gui');

        this.gui.open();

        const guiAny = this.gui as unknown as { $title: HTMLElement; _onTitleClick: () => void };
        if (guiAny.$title) {
            guiAny.$title.style.pointerEvents = 'none';
            guiAny.$title.style.cursor = 'default';
            guiAny.$title.style.background = 'none';
            guiAny.$title.style.backgroundColor = 'transparent';
            guiAny.$title.style.border = 'none';
            guiAny.$title.style.boxShadow = 'none';
            guiAny.$title.style.outline = 'none';
        }

        const styleEl = document.createElement('style');
        styleEl.textContent = `
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
            .viewer-gui > .lil-title,
            .lil-gui.viewer-gui > .lil-title {
                background: transparent !important;
                border: none !important;
            }
        `;
        document.head.appendChild(styleEl);

        if (typeof guiAny._onTitleClick === 'function') {
            guiAny._onTitleClick = () => { };
        }

        this.setupColorGrading();
        this.setupExportFolder();
    }

    private setupColorGrading(): void {
        this.gui
            .add(this.params, 'exposure', 0.1, 5, 0.1)
            .name('Exposure')
            .onChange((value: number) => {
                this.viewerRenderer.setExposure(value);
            });

        this.gui
            .add(this.params, 'contrast', -1, 1, 0.05)
            .name('Contrast')
            .onChange((value: number) => {
                this.viewerRenderer.setContrast(value);
            });

        this.gui
            .add(this.params, 'saturation', -1, 1, 0.05)
            .name('Saturation')
            .onChange((value: number) => {
                this.viewerRenderer.setSaturation(value);
            });

        this.gui
            .add(this.params, 'temperature', -1, 1, 0.05)
            .name('Temperature')
            .onChange((value: number) => {
                this.lightsManager.setTemperature(value);
            });

        this.gui
            .add(this.params, 'tint', -1, 1, 0.05)
            .name('Tint')
            .onChange((value: number) => {
                this.lightsManager.setTint(value);
            });

        this.gui
            .add(this.params, 'highlights', 0, 3, 0.1)
            .name('Highlights')
            .onChange((value: number) => {
                this.lightsManager.setHighlights(value);
            });

        this.gui
            .add(this.params, 'shadows', 0, 3, 0.1)
            .name('Shadows')
            .onChange((value: number) => {
                this.lightsManager.setShadows(value);
            });
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

        this.lightsManager.setTemperature(this.params.temperature);
        this.lightsManager.setTint(this.params.tint);
        this.lightsManager.setHighlights(this.params.highlights);
        this.lightsManager.setShadows(this.params.shadows);

        this.gui.controllers.forEach(c => c.updateDisplay());
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
                this.lightsManager.setTemperature(this.params.temperature);
            }
            if (importedParams.tint !== undefined) {
                this.params.tint = importedParams.tint;
                this.lightsManager.setTint(this.params.tint);
            }
            if (importedParams.highlights !== undefined) {
                this.params.highlights = importedParams.highlights;
                this.lightsManager.setHighlights(this.params.highlights);
            }
            if (importedParams.shadows !== undefined) {
                this.params.shadows = importedParams.shadows;
                this.lightsManager.setShadows(this.params.shadows);
            }
        }

        this.gui.controllers.forEach(c => c.updateDisplay());
    }

    public dispose(): void {
        this.gui.destroy();
    }
}
