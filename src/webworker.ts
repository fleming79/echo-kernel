import type Pyodide from 'pyodide';

async function load_pyoidide() {
  // Dynamically import Pyodide from the CDN

  const { loadPyodide }: typeof Pyodide = await import(
    /* webpackIgnore: true */ 'https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.mjs' as any
  );
  const pyodide = await loadPyodide();
  return pyodide;
}

let _initializer: any;
const ready = new Promise((resolve, reject) => {
      _initializer = { resolve, reject };
    });
const pyodideReadyPromise = load_pyoidide();

async function initialize(pyodide: Pyodide.PyodideAPI, options: any) {
  // const driveFS: DriveFS = await initFilesystem(pyodide, options);
  await initKernel(pyodide, options);
  _initializer?.resolve(null);
}


async function initKernel(pyodide: Pyodide.PyodideAPI, options: any) {
  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');
  await micropip.install('ssl');

  await pyodide.runPythonAsync(
    `
  import micropip
  
  await micropip.install("emfs:./async_kernel-0.10.2.dev3-py3-none-any.whl")
  deps = ["anyio>=4.12",
    "typing_extensions>=4.14",
    "aiologic>=0.16.0",
    "orjson>=3.10.16",
    "comm>=0.2",
    "ipython>=9.0",
    "traitlets>=5.14",
    "matplotlib-inline>0.1",
    "wrapt>=2.0.1"]

  # deps = [dep for dep in importlib.metadata.requires("async-kernel") if "emscripten" not in dep]
  await micropip.install(deps, reinstall=True)
  `
  );
  await pyodide.runPythonAsync(`
    import async_kernel
    async_kernel.Kernel().interface.start()
    _on_msg = async_kernel.Kernel().interface.on_msg
    `);
}

self.onmessage = async event => {
  // make sure loading is done
  const pyodide = await pyodideReadyPromise;

  switch (event.data.mode) {
    case 'initialize': {
      initialize(pyodide, event.data.options);
    }
    case 'msg': {
      await ready;
      try {
        const buffers = pyodide.toPy(event.data.msg.buffers);
        delete event.data.msg.buffers;
        const msg_string = JSON.stringify(event.data.msg);
        pyodide.runPythonAsync('_on_msg(msg_string, buffers)', {
          locals: pyodide.toPy({ msg_string, buffers }) as any
        });
      } catch (error) {
        self.postMessage({ error: error });
      }
      break;
    }
  }
};
