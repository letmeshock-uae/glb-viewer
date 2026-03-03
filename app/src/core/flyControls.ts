import * as THREE from 'three';

export interface FlyControlsConfig {
    /** Movement speed in units/second */
    moveSpeed: number;
    /** Mouse look sensitivity (radians per pixel) */
    lookSensitivity: number;
}

const DEFAULT_CONFIG: FlyControlsConfig = {
    moveSpeed: 5,
    lookSensitivity: 0.002,
};

/**
 * First-person fly controls.
 *
 * Movement:
 *   W / S  — forward / backward
 *   A / D  — strafe left / right
 *   Q      — move down (world Y-)
 *   E      — move up   (world Y+)
 *
 * Look:
 *   Hold left mouse button and drag — yaw & pitch
 *   OR lock pointer (click canvas to capture) — free look
 *
 * Toggle fly mode from outside by calling enable() / disable().
 */
export class FlyControls {
    private camera: THREE.Camera;
    private domElement: HTMLElement;
    private config: FlyControlsConfig;

    private _enabled = false;

    // Movement keys state
    private keys: Record<string, boolean> = {};

    // Euler for look (we own it to avoid gimbal lock issues with quaternion)
    private euler = new THREE.Euler(0, 0, 0, 'YXZ');

    // Mouse drag state (fallback when pointer is NOT locked)
    private isDragging = false;
    private lastMouseX = 0;
    private lastMouseY = 0;

    // Reusable vectors (avoids GC per-frame)
    private readonly _forward = new THREE.Vector3();
    private readonly _right = new THREE.Vector3();
    private readonly _moveDir = new THREE.Vector3();

    // Bound event handlers (stored so we can remove them)
    private _onKeyDown: (e: KeyboardEvent) => void;
    private _onKeyUp: (e: KeyboardEvent) => void;
    private _onMouseDown: (e: MouseEvent) => void;
    private _onMouseMove: (e: MouseEvent) => void;
    private _onMouseUp: (e: MouseEvent) => void;
    private _onPointerLockChange: () => void;
    private _onContextMenu: (e: Event) => void;

    constructor(
        camera: THREE.Camera,
        domElement: HTMLElement,
        config: Partial<FlyControlsConfig> = {}
    ) {
        this.camera = camera;
        this.domElement = domElement;
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Sync euler from the camera's current orientation
        this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');

        this._onKeyDown = this.handleKeyDown.bind(this);
        this._onKeyUp = this.handleKeyUp.bind(this);
        this._onMouseDown = this.handleMouseDown.bind(this);
        this._onMouseMove = this.handleMouseMove.bind(this);
        this._onMouseUp = this.handleMouseUp.bind(this);
        this._onPointerLockChange = this.handlePointerLockChange.bind(this);
        this._onContextMenu = (e) => { if (this._enabled) e.preventDefault(); };
    }

    // ─── Public API ───────────────────────────────────────────────────────

    get enabled(): boolean {
        return this._enabled;
    }

    /**
     * Activate fly controls.
     * Call this after disabling OrbitControls.
     */
    public enable(): void {
        if (this._enabled) return;
        this._enabled = true;

        // Sync euler from the current camera orientation so there is no jump
        this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ');

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        this.domElement.addEventListener('mousedown', this._onMouseDown);
        this.domElement.addEventListener('contextmenu', this._onContextMenu);
        document.addEventListener('pointerlockchange', this._onPointerLockChange);
    }

    /** Deactivate fly controls. */
    public disable(): void {
        if (!this._enabled) return;
        this._enabled = false;
        this.keys = {};
        this.isDragging = false;

        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this.domElement.removeEventListener('mousedown', this._onMouseDown);
        this.domElement.removeEventListener('contextmenu', this._onContextMenu);
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);

        // Exit pointer lock if we have it
        if (document.pointerLockElement === this.domElement) {
            document.exitPointerLock();
        }
    }

    /** Release all resources. Should be called when the viewer is destroyed. */
    public dispose(): void {
        this.disable();
    }

    /**
     * Must be called every frame from the render loop.
     * @param delta  Time since last frame in seconds.
     */
    public update(delta: number): void {
        if (!this._enabled) return;

        // Shift = 5× speed burst
        const shiftHeld = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const speed = this.config.moveSpeed * delta * (shiftHeld ? 5 : 1);

        // True 6-DOF forward — fly exactly where the camera points
        this.camera.getWorldDirection(this._forward);
        if (this._forward.lengthSq() < 1e-10) return; // safety: degenerate state

        // Right axis = forward × up
        this._right.crossVectors(this._forward, new THREE.Vector3(0, 1, 0));
        if (this._right.lengthSq() < 1e-10) {
            // Camera looks straight up/down — use world X as fallback right
            this._right.set(1, 0, 0);
        } else {
            this._right.normalize();
        }

        this._moveDir.set(0, 0, 0);

        if (this.keys['KeyW'] || this.keys['ArrowUp']) {
            this._moveDir.addScaledVector(this._forward, 1);
        }
        if (this.keys['KeyS'] || this.keys['ArrowDown']) {
            this._moveDir.addScaledVector(this._forward, -1);
        }
        if (this.keys['KeyD'] || this.keys['ArrowRight']) {
            this._moveDir.addScaledVector(this._right, 1);
        }
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
            this._moveDir.addScaledVector(this._right, -1);
        }
        // Q/E — explicit world-up/down regardless of look direction
        if (this.keys['KeyE']) {
            this._moveDir.y += 1;
        }
        if (this.keys['KeyQ']) {
            this._moveDir.y -= 1;
        }

        if (this._moveDir.lengthSq() > 0) {
            this._moveDir.normalize();
            this.camera.position.addScaledVector(this._moveDir, speed);
            // Make sure Three.js picks up the position change
            this.camera.updateMatrixWorld();
        }
    }

    /** Update moveSpeed at runtime (e.g. from GUI). */
    public setMoveSpeed(speed: number): void {
        this.config.moveSpeed = speed;
    }

    /** Update look sensitivity at runtime. */
    public setLookSensitivity(sensitivity: number): void {
        this.config.lookSensitivity = sensitivity;
    }

    // ─── Private event handlers ───────────────────────────────────────────

    private handleKeyDown(e: KeyboardEvent): void {
        // Don't steal shortcuts when user is typing in an input
        if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
        this.keys[e.code] = true;
    }

    private handleKeyUp(e: KeyboardEvent): void {
        this.keys[e.code] = false;
    }

    private handleMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return; // left button only
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;

        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('mouseup', this._onMouseUp);

        // Request pointer lock for smoother look (optional, degrades gracefully)
        if (!document.pointerLockElement) {
            this.domElement.requestPointerLock().catch(() => {/* ignore */ });
        }
    }

    private handleMouseMove(e: MouseEvent): void {
        if (!this._enabled) return;

        let dx: number;
        let dy: number;

        if (document.pointerLockElement === this.domElement) {
            // Pointer locked — use raw movement
            dx = e.movementX;
            dy = e.movementY;
        } else if (this.isDragging) {
            // Fallback: delta from last position
            dx = e.clientX - this.lastMouseX;
            dy = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        } else {
            return;
        }

        const sens = this.config.lookSensitivity;
        this.euler.y -= dx * sens;                         // Yaw (left/right)
        this.euler.x -= dy * sens;                         // Pitch (up/down)
        this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));

        this.camera.quaternion.setFromEuler(this.euler);
    }

    private handleMouseUp(e: MouseEvent): void {
        if (e.button !== 0) return;
        this.isDragging = false;
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('mouseup', this._onMouseUp);

        // Exit pointer lock on mouse release
        if (document.pointerLockElement === this.domElement) {
            document.exitPointerLock();
        }
    }

    private handlePointerLockChange(): void {
        if (document.pointerLockElement === this.domElement) {
            // Pointer just locked — start listening for move events globally
            document.addEventListener('mousemove', this._onMouseMove);
        } else {
            // Pointer lock released
            if (!this.isDragging) {
                document.removeEventListener('mousemove', this._onMouseMove);
            }
        }
    }
}
