import * as THREE from 'three';
import { ViewerRenderer } from './core/renderer';
import { ViewerScene } from './core/scene';
import { ViewerCamera } from './core/camera';
import { ViewerControls } from './core/controls';
import { EnvironmentManager } from './core/env';
import { LightsManager } from './core/lights';
import { loadFromFile, type LoadResult } from './loaders/loadAny';
import { Dropzone, createFilePicker } from './ui/dropzone';
import { ViewerGUI } from './ui/gui';
import './style.css';

class GLBViewer {
  private container: HTMLElement;
  private guiContainer: HTMLElement;
  private renderer: ViewerRenderer;
  private scene: ViewerScene;
  private camera: ViewerCamera;
  private controls: ViewerControls;
  private envManager: EnvironmentManager;
  private lightsManager: LightsManager;
  private gui: ViewerGUI;
  private dropzone: Dropzone;
  private filePicker: HTMLInputElement;
  private loadingOverlay: HTMLElement;
  private animationId: number = 0;
  private currentAnimations: THREE.AnimationClip[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private clock: THREE.Clock;

  constructor() {
    // Setup containers
    this.container = document.getElementById('viewer-container')!;
    this.guiContainer = document.getElementById('gui-container')!;

    // Initialize clock
    this.clock = new THREE.Clock();

    // Create loading overlay
    this.loadingOverlay = this.createLoadingOverlay();

    // Initialize core systems
    this.renderer = new ViewerRenderer(this.container);
    this.scene = new ViewerScene();

    const { width, height } = this.renderer.getSize();
    this.camera = new ViewerCamera(width / height);

    this.controls = new ViewerControls(
      this.camera.camera,
      this.renderer.renderer.domElement
    );

    this.envManager = new EnvironmentManager(
      this.renderer.renderer,
      this.scene.scene
    );

    this.lightsManager = new LightsManager(this.scene.scene);

    // Initialize GUI
    this.gui = new ViewerGUI(
      this.guiContainer,
      this.renderer,
      this.envManager,
      this.lightsManager,
      {
        onOpen: () => this.filePicker.click(),
        onReset: () => this.resetScene(),
        onFit: () => this.fitToModel(),
        onToggleGrid: () => this.scene.toggleGrid(),
        onToggleAxes: () => this.scene.toggleAxes(),
        onScreenshot: () => this.takeScreenshot()
      }
    );

    // Setup dropzone
    this.dropzone = new Dropzone({
      container: this.container,
      onDrop: this.handleFileDrop.bind(this),
    });

    // Setup file picker
    this.filePicker = createFilePicker(this.handleFileDrop.bind(this));
    document.body.appendChild(this.filePicker);

    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));

    // Start render loop
    this.animate();

    console.log('🚀 GLB/PLY/SOG Viewer initialized');

    // Auto-load test model for debugging
    this.loadTestModel();
  }

  private async loadTestModel(): Promise<void> {
    try {
      const response = await fetch('/Hub_Light.glb');
      if (response.ok) {
        console.log('🔄 Loading test model...');
        const data = await response.arrayBuffer();
        const result = await loadFromFile(new File([data], 'Hub_Light.glb'), (p) => {
          console.log(`Loading: ${p.toFixed(1)}%`);
        });
        this.handleLoadResult(result);
      }
    } catch (e) {
      console.log('ℹ️ No test model found, waiting for user upload');
    }
  }

  private createLoadingOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <p class="loading-text">Loading...</p>
        <div class="loading-progress">
          <div class="loading-progress-bar"></div>
        </div>
      </div>
    `;
    this.container.appendChild(overlay);
    return overlay;
  }

  private showLoading(show: boolean, progress: number = 0, text: string = 'Loading...'): void {
    if (show) {
      this.loadingOverlay.classList.add('active');
      const textEl = this.loadingOverlay.querySelector('.loading-text');
      const barEl = this.loadingOverlay.querySelector('.loading-progress-bar') as HTMLElement;
      if (textEl) textEl.textContent = text;
      if (barEl) barEl.style.width = `${progress}%`;
    } else {
      this.loadingOverlay.classList.remove('active');
    }
  }

  private async handleFileDrop(file: File): Promise<void> {
    console.log(`📁 Loading file: ${file.name}`);
    this.showLoading(true, 0, `Loading ${file.name}...`);

    try {
      const result = await loadFromFile(file, (progress) => {
        this.showLoading(true, progress, `Loading ${file.name}...`);
      });

      this.handleLoadResult(result);
      this.showLoading(false);
      console.log(`✅ Loaded: ${file.name} (${result.type})`);
    } catch (error) {
      console.error('❌ Load error:', error);
      this.showLoading(false);
      alert(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private handleLoadResult(result: LoadResult): void {
    // Clear previous model
    this.scene.removeModel();
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }

    console.log('📦 Model object:', result.object);
    console.log('📦 Model children:', result.object.children?.length);

    // Add new model
    this.scene.addModel(result.object);

    // Update shadows for the new model
    this.lightsManager.updateShadowsForModel(result.object);

    // Add shadow ground plane at the bottom of the model
    const box = new THREE.Box3().setFromObject(result.object);
    const modelSize = box.getSize(new THREE.Vector3());
    this.lightsManager.addShadowGround(box.min.y, Math.max(modelSize.x, modelSize.z) * 3);

    // Setup animations if any
    if (result.animations && result.animations.length > 0) {
      this.currentAnimations = result.animations;
      this.mixer = new THREE.AnimationMixer(result.object);

      // Play first animation by default
      const action = this.mixer.clipAction(result.animations[0]);
      action.play();
    }

    // Fit camera to model
    this.fitToModel();
  }

  private fitToModel(): void {
    const model = this.scene.getCurrentModel();
    if (!model) {
      console.log('⚠️ No model to fit');
      return;
    }

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    console.log('📐 Model bounding box:', {
      min: box.min.toArray(),
      max: box.max.toArray(),
      size: size.toArray(),
      center: center.toArray()
    });

    const { center: camCenter } = this.camera.fitToObject(model);
    this.controls.setTarget(camCenter);
    console.log('📷 Camera target set to:', camCenter.toArray());
  }

  private resetScene(): void {
    this.scene.reset();
    this.camera.reset();
    this.controls.reset();
    this.lightsManager.reset();
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.currentAnimations = [];
    console.log('🔄 Scene reset');
  }

  private takeScreenshot(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.renderer.takeScreenshot(`viewer-screenshot-${timestamp}.png`);
    console.log('📸 Screenshot saved');
  }

  private handleResize(): void {
    const { width, height } = this.renderer.getSize();
    this.camera.updateAspect(width, height);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));

    const delta = this.clock.getDelta();

    // Update animations
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Update controls
    this.controls.update();

    // Render
    this.renderer.render(this.scene.scene, this.camera.camera);
  }

  public dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.gui.dispose();
    this.dropzone.dispose();
    this.controls.dispose();
    this.envManager.dispose();
    this.renderer.dispose();
  }
}

// Initialize the viewer when DOM is ready
function init(): void {
  const viewerContainer = document.getElementById('viewer-container');
  const guiContainer = document.getElementById('gui-container');

  if (!viewerContainer || !guiContainer) {
    console.error('❌ Required container elements not found');
    return;
  }

  try {
    new GLBViewer();
  } catch (error) {
    console.error('❌ Failed to initialize viewer:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
