# jupyterlite-async-kernel

An asynchronous Python kernel for JupyterLite providing an IPython shell.

**Note: This is a demo implementation of [async-kernel](github.com/fleming79/async-kernel) running in Jupyterlite.**
 

## Requirements

- JupyterLite >= 0.7.0

## Install

To install the extension, execute:

```bash
pip install git+https://github.com/fleming79/echo-kernel
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
        "pyodideUrl": "https://cdn.jsdelivr.net/pyodide/v314.0.0/full/pyodide.mjs",
        "loadPyodideOptions": {
          "packages": [],
          "lockFileURL": "https://cdn.jsdelivr.net/pyodide/v314.0.0/full/pyodide-lock.json?from-lite-config=1"
        },
        "name": "async",
        "display_name": "Python (async)",
        "kernelSettings": {},
        "startScript": "",
        "postStartScript": ""
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
- **[`startScript`](#startinterfacescript)** The script to start the kernel.
- **`postStartScript`** A script to call after the kernel has started. This is
  asynchronous but the kernel will not be made available until it returns.

### startScript

The interface script loads the kernel interface and starts the kernel. This can be
customised as desired.

The namespace where the start script is called looks like this.

```python
{
 send: Callable[[str, list | None, bool], None | str],
stopped: Callable[[], None],
settings: dict | None = None
}
```

see
[start_kernel_callable_interface](https://fleming79.github.io/async-kernel/latest/reference/interface/#async_kernel.interface.start_kernel_callable_interface)
to see

[https://fleming79.github.io/async-kernel/latest/reference/interface/#async_kernel.interface.start_kernel_callable_interface]

The script must return a namespace (dictionary) with
[required handlers](https://fleming79.github.io/async-kernel/latest/reference/interface/#async_kernel.interface.callable.Handlers).

#### Default startScript

```python
import micropip
import pathlib

# locate all wheels in the current folder and below
deps = [f"emfs:./{p}" for p in pathlib.Path(".").glob("**/*.whl")]

# Add async-kernel as a dependency
deps.append("async-kernel")

# Install all wheels
await micropip.install(deps, keep_going=True, reinstall=True)

import async_kernel.interface

# Start the interface and return the handlers
async_kernel.interface.start_kernel_callable_interface(send=send, stopped=stopped, settings=settings)
```

### Embedding wheels

A convenient way to embed wheels in jupyterlite is to list them in a text file
"embed-wheels.txt". Without knowing which files are federated extensions, the safest
thing to do is to install all the embedded files locally, and then to download the
wheels into the files directory. The downloaded wheels need to target pyemscripten_2026_0.

See "jupyterlite:setup" in ['package.json'](./package.json) for an example.

```bash
# Install wheels locally
uv run pip install -r site/embed-wheels.txt

# Downoad wheels
uv run pip download --platform pyemscripten_2026_0 --only-binary=:all: --python-version=3.14  --no-deps -r site/embed-wheels.txt --dest site/files/wheels
```

#### Pip/micropip

Pip is implemented in async-kernel and is directly available as the magic '%pip'.

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

# Rebuild after making changes to source or for the first time
jlpm clean:all
jlpm build

# Setup Jupyterlite for development 
# Note: This installs dependencies listed embed-wheels.txt in the current venv. 
# This is necessary for federated extension (Jupyterlab extensions) such as IPywidgets

jlpm jupyterlite:setup

# Serve the jupyterlite repo
jlpm serve
```

Use one of the VSCode debug configurations to launch a browser with the debugger attached

- "Jupyterlite frontend with Firefox"
- "Jupyterlite with Editor Browser" 


### Packaging the extension

See [RELEASE](RELEASE.md)
