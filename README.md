# jupyterlite-async-kernel

An asynchronous python kernel for JupyterLite.

## Requirements

- JupyterLite >= 0.7.0

## Install

To install the extension, execute:

```bash
pip install jupyterlite-async-kernel
```

Then build your JupyterLite site:

```bash
jupyter lite build
```

### Configuration

The kernel is configurable by adding entries in a configuration file
(`jupyter-lite.{json,ipynb}`) or override file (`overrides.json`) in one or more of the
[well know locations](https://jupyterlite.readthedocs.io/en/stable/reference/cli.html#well-known-files)
.

### Example config

typical filename: `jupyter-lite.json`

```json
{
  "jupyter-lite-schema-version": 0,
  "jupyter-config-data": {
    "appName": "JupyterLite",
    "litePluginSettings": {
      "@jupyterlite/async-kernel:kernel": {
        "pyodideUrl": "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js",
        "loadPyodideOptions": {
          "packages": ["matplotlib", "micropip", "numpy", "sqlite3", "ssl"],
          "lockFileURL": "https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide-lock.json?from-lite-config=1"
        },
        "name": "async",
        "display_name": "Python (async)",
        "kernelSettings": { "shell.timeout": "1" },
        "startInterfaceScript": "import micropip\nimport pathlib\n\ndeps = [f'emfs:./{p}' for p in pathlib.Path('.').glob('**/*.whl')]\ndeps.append('async-kernel')\nawait micropip.install(deps, keep_going=True, reinstall=True)\nimport async_kernel.interface\n\nasync_kernel.interface.start_kernel_callable_interface(send=send, stopped=stopped, settings=settings)",
        "kernelPostStartScript": ""
      }
    }
  }
}
```

- **`pyodideUrl`**: The url to the CDN for Pyodide.
- **`loadPyodideOptions`**: Options passed when calling
  [loadPyodide](https://pyodide.org/en/stable/usage/api/js-api.html#exports.loadPyodide).
  [options](https://pyodide.org/en/stable/usage/api/js-api.html#exports.PyodideConfig).
- **`name`** (default='async'): The name to use to register the kernel.
- **`language`** (default='python'): The language the kernel supports.
- **`kernelSettings`**: Options passed to the kernel prior to starting it. Use dotted
  values to override nested values/traits.
- **`icon`** The url of the icon to use. See:
  [copy_logo_to_defaults.py](./copy_logo_to_defaults.py) for an example of embedding a
  logo in base64.
- **`startInterfaceScript`** A script to create an instance of a kernel. Use this for
  advanced customisation of the kernel. By default, all wheels in the folder an
  subfolders where the kernel is started will be installed prior to loading the kernel
  starts. The example below includes the default code. The last line must be an
  expression that returns the kernel instance.
- **`kernelPostStartScript`** A script to call after the kernel has started. This is
  asynchronous but the kernel will not be made available until it returns.

## Contributing

### Development install

Use uv to provide a virtual environment.

The `jlpm` command is JupyterLab's pinned version of [yarn](https://yarnpkg.com/) that
is installed with JupyterLab. You may use `yarn` or `npm` in lieu of `jlpm` below.

```bash
# Clone the repo to your local environment
# Change directory to the jupyterlite-async-kernel directory
# Install package in development mode
uv venv --python 3.13
uv sync
# Activate the environment

# Install packages
jlpm

# Rebuild extension Typescript source after making changes
jlpm clean:all
jlpm build

# Setup jupyterlite for development
jlpm jupyterlite:setup

# Serve the jupyterlite repo
jlpm serve
```

Use the VSCode debug configuration "Jupyterlite frontend with Firefox" to launch a
browse with the debugger attached.

### Packaging the extension

See [RELEASE](RELEASE.md)
