import { KernelMessage } from '@jupyterlab/services';
import { IKernel } from '@jupyterlite/services';

import type { ISignal } from '@lumino/signaling';
import { Signal } from '@lumino/signaling';
import { PromiseDelegate } from '@lumino/coreutils';

// @ts-ignore # we need to ensure this module can be imported
import { DriveFS } from '@jupyterlite/services/lib/contents/drivefs';

/**
 * A kernel to relay messages to the python async kernel.
 */
export class AsyncKernelInterface implements IKernel {
  /**
   * Construct a new BaseKernel.
   *
   * @param options The instantiation options for a BaseKernel.
   */
  constructor(options: IKernel.IOptions | any) {
    const { id, name, location, sendMessage, baseUrl, browsingContextId } =
      options;
    this._id = id;
    this._name = name;
    this._location = location;
    this._sendMessage = sendMessage;
    this._pyodideWorker = new Worker(
      new URL('./webworker.js', import.meta.url),
      { type: 'module' }
    );
    this._pyodideWorker.onmessage = e => {
      if (e.data.ready) this._ready.resolve();
      else {
        if (e.data.msg_string) {
          const msg = JSON.parse(e.data.msg_string);
          msg.buffers = e.data.buffers;
          this._sendMessage(msg);
        } else {
          // todo: log errors
        }
      }
    };
    this._pyodideWorker.postMessage({
      mode: 'initialize',
      options: { id, name, location, baseUrl, browsingContextId }
    });
  }

  /**
   * Handle an incoming message from the client.
   *
   * @param msg The message to handle
   */
  async handleMessage(msg: KernelMessage.IMessage): Promise<void> {
    await this.ready;
    this._pyodideWorker.postMessage({ mode: 'msg', msg: JSON.stringify(msg) });
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
   * Get the kernel id
   */
  get id(): string {
    return this._id;
  }

  /**
   * Get the name of the kernel
   */
  get name(): string {
    return this._name;
  }

  /**
   * The location in the virtual filesystem from which the kernel was started.
   */
  get location(): string {
    return this._location;
  }

  /**
   * The current execution count
   */
  get executionCount(): number {
    return this._executionCount;
  }

  /**
   * Get the last parent header
   */
  get parentHeader():
    | KernelMessage.IHeader<KernelMessage.MessageType>
    | undefined {
    return this._parentHeader;
  }

  /**
   * Get the last parent message (mimic ipykernel's get_parent)
   */
  get parent(): KernelMessage.IMessage | undefined {
    return this._parent;
  }

  /**
   * Dispose the kernel.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._pyodideWorker.terminate();
    this._isDisposed = true;
    this._disposed.emit(void 0);
  }

  private _id: string;
  private _name: string;
  private _location: string;
  private _pyodideWorker: Worker;
  private _executionCount = 0;
  private _isDisposed = false;
  private _ready = new PromiseDelegate<void>();
  private _disposed = new Signal<this, void>(this);
  private _sendMessage: IKernel.SendMessage;
  private _parentHeader:
    | KernelMessage.IHeader<KernelMessage.MessageType>
    | undefined = undefined;
  private _parent: KernelMessage.IMessage | undefined = undefined;
}
