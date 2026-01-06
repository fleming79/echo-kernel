/**
 * A namespace for CallableKernelInterface statics.
 */
export namespace CallableKernelInterface {
  /**
   * The instantiation options for an Async kernel.
   */
  export interface IOptions {
    /**
     * The kernel id.
     */
    id: string;

    /**
     * The kernel name.
     */
    name: string;

    /**
     * The location where the kernel started.
     */
    location: string;

    /**
     * The base URL.
     */
    baseUrl: string;

    /**
     * The URL to fetch Pyodide (Plugin configurable).
     */
    pyodideUrl: string;

    /**
     * Additional options to provide to `loadPyodide` (Plugin configurable).
     *
     * @see https://pyodide.org/en/stable/usage/api/js-api.html#exports.PyodideConfig
     */
    loadPyodideOptions: Record<string, any> & {
      lockFileURL: string;
      packages: string[];
    };

    /**
     * The ID of the browsing context where the request originated.
     */
    browsingContextId: string;

    /**
     * Settings made available in the namespace when calling `startScript`.
     * Plugin configurable.
     */
    kernelSettings: any;

    /**
     * A Python script to start the kernel with a callback interface (Plugin configurable).
     *
     * The script should use the objects: `settings`, `send` and `stopped`.
     *
     * `settings`: A mapping of settings (default passes the settings to the kernel).
     * `send`: A callable for the kernel to send messages to the client.
     * `stopped`: A callback for when the kernel is stopped.
     *
     * The script should return an awaitable that resolves with the `@interface IKernelInterface`
     *
     */
    startScript: string;

    /**
     * A Python script to run once the kernel has started (Plugin configurable).
     */
    postStartScript: string;
  }

  /**
   * The kernel interface callbacks (Python).
   *
   * This defines the callbacks expected as the result of the last line of code in the `startScript`.
   */
  export interface IKernelInterface {
    /**
     * The kernel interface callback to handle messages.
     *
     * @param msg_json The message encoded as a json string
     * @param buffers Buffers corresponding to the message
     */
    handle_msg: (msg_json: string, buffers: Array<Buffer> | undefined) => void;

    /**
     * The callback to stop the kernel.
     */
    stop: () => void;
  }
}
