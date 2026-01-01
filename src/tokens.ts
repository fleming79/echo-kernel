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
     * The URL to fetch Pyodide.
     * Plugin configurable.
     */
    pyodideUrl: string;

    /**
     * additional options to provide to `loadPyodide`
     * Plugin configurable.
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
     * Settings to load into the python kernel during instantiation.
     * Plugin configurable.
     */
    kernelSettings: any;

    /**
     * A script to run to load the kernel interface.
     *
     * options are provided in the namespace while the scrupt must return a function
     * that when called will start the kernel and return the interface below.
     */
    startInterfaceScript: string;

    /**
     * A script to run after the kernel has started.
     */
    kernelPostStartScript: string;
  }

  /**
   * The interface to the kernel returned by calling the method returned from .
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
     * The kernel interface to stop the kernel.
     */
    stop: () => void;
  }
}
