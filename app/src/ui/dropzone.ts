export type DropHandler = (file: File) => void;

export interface DropzoneConfig {
    container: HTMLElement;
    onDrop: DropHandler;
    acceptedExtensions?: string[];
}

export class Dropzone {
    private container: HTMLElement;
    private overlay: HTMLElement;
    private onDrop: DropHandler;
    private acceptedExtensions: string[];

    constructor(config: DropzoneConfig) {
        this.container = config.container;
        this.onDrop = config.onDrop;
        this.acceptedExtensions = config.acceptedExtensions ?? ['.glb', '.gltf', '.ply', '.sog'];

        this.overlay = this.createOverlay();
        this.container.appendChild(this.overlay);

        this.bindEvents();
    }

    private createOverlay(): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'dropzone-overlay';
        overlay.innerHTML = `
      <div class="dropzone-content">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17,8 12,3 7,8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <h2>Drop Your 3D File</h2>
        <p>Supports GLB, GLTF, PLY (mesh & splat), SOG</p>
      </div>
    `;
        return overlay;
    }

    private bindEvents(): void {
        const events = ['dragenter', 'dragover', 'dragleave', 'drop'];
        events.forEach((eventName) => {
            this.container.addEventListener(eventName, this.preventDefaults.bind(this));
        });

        this.container.addEventListener('dragenter', this.handleDragEnter.bind(this));
        this.container.addEventListener('dragover', this.handleDragOver.bind(this));
        this.container.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.container.addEventListener('drop', this.handleDrop.bind(this));
    }

    private preventDefaults(e: Event): void {
        e.preventDefault();
        e.stopPropagation();
    }

    private handleDragEnter(e: DragEvent): void {
        this.overlay.classList.add('active');
    }

    private handleDragOver(e: DragEvent): void {
        this.overlay.classList.add('active');
    }

    private handleDragLeave(e: DragEvent): void {
        // Only hide if leaving the container entirely
        const rect = this.container.getBoundingClientRect();
        if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
        ) {
            this.overlay.classList.remove('active');
        }
    }

    private handleDrop(e: DragEvent): void {
        this.overlay.classList.remove('active');

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();

        if (this.acceptedExtensions.includes(ext)) {
            this.onDrop(file);
        } else {
            console.warn(`Unsupported file type: ${ext}`);
            this.showError(`Unsupported format. Use: ${this.acceptedExtensions.join(', ')}`);
        }
    }

    private showError(message: string): void {
        const errorEl = document.createElement('div');
        errorEl.className = 'dropzone-error';
        errorEl.textContent = message;
        this.container.appendChild(errorEl);

        setTimeout(() => {
            errorEl.remove();
        }, 3000);
    }

    public dispose(): void {
        this.overlay.remove();
    }
}

export function createFilePicker(
    onSelect: DropHandler,
    acceptedExtensions: string[] = ['.glb', '.gltf', '.ply', '.sog']
): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptedExtensions.join(',');
    input.style.display = 'none';

    input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            onSelect(file);
        }
        // Reset input so same file can be selected again
        input.value = '';
    });

    return input;
}
