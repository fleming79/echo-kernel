import type { KernelMessage } from '@jupyterlab/services';
import { IKernel } from '@jupyterlite/services';

import type { ISignal } from '@lumino/signaling';
import type { ILogPayload } from '@jupyterlab/logconsole';
import type { AsyncKernel } from './webworker';

import { Signal } from '@lumino/signaling';
import { PromiseDelegate } from '@lumino/coreutils';

/**
 * A kernel interface to relay messages between the client and kernel running in a webworker.
 */
export class KernelRelay implements IKernel {
  /**
   * Construct a new KernelRelay.
   *
   * @param options The instantiation options for an KernelRelay.
   */
  constructor(
    options: IKernel.IOptions & AsyncKernel.IOptions,
    logger: (options: { payload: ILogPayload; kernelId: string }) => void
  ) {
    const { id, name, sendMessage, location } = options;
    this.id = id;
    this.name = name;
    this.location = location;
    this._sendMessage = sendMessage;
    this._logger = logger;

    // The webworker is built using eslint to ensure the imports can be imported at runtime.
    // see: jlpm build:worker (called by jlpm build).
    this._pyodideWorker = new Worker(new URL('./webworker.js', import.meta.url), {
      type: 'module'
    });
    this._pyodideWorker.onmessage = this.handlePyodideWorkerMessage.bind(this);
    const kernelOptions: AsyncKernel.IOptions = {
      id,
      name,
      location: location,
      baseUrl: options.baseUrl,
      browsingContextId: options.browsingContextId,
      pyodideUrl: options.pyodideUrl,
      loadPyodideOptions: options.loadPyodideOptions,
      kernelOptions: options.kernelOptions,
      kernelLoadScript: options.kernelLoadScript,
      kernelPostStartScript: options.kernelPostStartScript
    };
    this._pyodideWorker.postMessage({ mode: 'initialize', options: kernelOptions });
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
  }

  /**
   * Handle an incoming message from the pyodide web worker.
   *
   * @param e The message event
   */
  async handlePyodideWorkerMessage(e: MessageEvent) {
    switch (e.data.mode) {
      case 'msg': {
        const msg = JSON.parse(e.data.msg_string);
        msg.buffers = e.data.buffers;
        this._sendMessage(msg);
        break;
      }
      case 'log': {
        this._logger({ payload: e.data.log, kernelId: this.id });
        break;
      }
      case 'ready': {
        this._ready.resolve();
        break;
      }
      case 'stopped':
        {
          this._pyodideWorker?.terminate();
          //@ts-expect-error
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
  private _logger: (options: { payload: ILogPayload; kernelId: string }) => void;
  private _isDisposed = false;
  private _ready = new PromiseDelegate<void>();
  private _disposed = new Signal<this, void>(this);
  private _sendMessage: IKernel.SendMessage;
}
