
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
     * Options passed to the python kernel during instantiation.
     * Plugin configurable.
     */
    kernelOptions: any;

    /**
     * A script to run to load the kernel.
     */
    kernelLoadScript?: string;

    /**
     * A script to run after the kernel has started.
     */
    kernelPostStartScript?: string;

  }
}
