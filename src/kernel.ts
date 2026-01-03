import type { ILogPayload } from '@jupyterlab/logconsole';
import type { KernelMessage } from '@jupyterlab/services';
import { IKernel } from '@jupyterlite/services';
import { PromiseDelegate } from '@lumino/coreutils';
import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';
import type { CallableKernelInterface } from './tokens';

/**
 * A kernel interface to relay messages between the client and kernel running in a webworker.
 */
export class KernelRelay implements IKernel {
  /**
   *
   * @param options All options
   * @param sendMessage A callback to send the message
   * @param logger A callable for logging to the user interface
   */
  constructor(
    options: CallableKernelInterface.IOptions,
    sendMessage: IKernel.SendMessage,
    logger: (options: { payload: ILogPayload; kernelId: string }) => void
  ) {
    const { id, name, location } = options;
    this.id = id;
    this.name = name;
    this.location = location;
    this._sendMessage = sendMessage;
    this._logger = logger;

    // The webworker is built using eslint to ensure the imports can be imported at runtime.
    // see: jlpm build:worker (called by jlpm build). related: https://github.com/jupyterlite/pyodide-kernel/issues/222 https://github.com/jupyterlab/jupyterlab/issues/10197
    this._pyodideWorker = new Worker(new URL('./webworker.js', import.meta.url), {
      type: 'module'
    });
    this._pyodideWorker.onmessage = this.handlePyodideWorkerMessage.bind(this);
    this._pyodideWorker.postMessage({ mode: 'initialize', options });
  }

  /**
   * A promise that is fulfilled when the kernel is ready.
   */
  get ready(): Promise<void> {
    return this._ready.promise;
  }

  /**
   * Return whether the kernel is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * A signal emitted when the kernel is disposed.
   */
  get disposed(): ISignal<this, void> {
    return this._disposed;
  }

  /**
   * Handle an incoming message from the client.
   *
   * @param msg The message event
   */
  async handleMessage(msg: KernelMessage.IMessage): Promise<void> {
    await this.ready;
    this._pyodideWorker.postMessage({ mode: 'msg', msg });
    if (this._interruptBuffer && msg.header.msg_type === 'interrupt_request') {
      // https://pyodide.org/en/stable/usage/keyboard-interrupts.html
      this._interruptBuffer[0] = 2;
    }
  }

  /**
   * Handle an incoming message from the pyodide web worker.
   *
   * @param e The message event
   */
  async handlePyodideWorkerMessage(e: MessageEvent) {
    switch (e.data.mode) {
      case 'msg': {
        this._sendMessage(e.data.msg);
        break;
      }
      case 'log': {
        this._logger({ payload: e.data.log, kernelId: this.id });
        break;
      }
      case 'ready': {
        this._ready.resolve();
        this._interruptBuffer = e.data.interruptBuffer;
        break;
      }
      case 'stopped':
        {
          this._pyodideWorker?.terminate();
          //@ts-expect-error We are shutting down and want this to be removed.
          delete this._pyodideWorker;
          this.dispose();
        }
        break;
    }
  }

  /**
   * Dispose the kernel.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._ready.reject(`${this.id} was disposed`);
    try {
      // Give the kernel a chance to shutdown gracefully.
      this._pyodideWorker.postMessage({ mode: 'stop' });
      return;
    } catch {
      // nothing to see here
    }
    this._isDisposed = true;
    this._disposed.emit(void 0);
  }

  readonly id: string;
  readonly name: string;
  readonly location: string;

  private _pyodideWorker: Worker;
  private _interruptBuffer: Uint8Array | undefined;
  private _logger: (options: { payload: ILogPayload; kernelId: string }) => void;
  private _isDisposed = false;
  private _ready = new PromiseDelegate<void>();
  private _disposed = new Signal<this, void>(this);
  private _sendMessage: IKernel.SendMessage;
}
