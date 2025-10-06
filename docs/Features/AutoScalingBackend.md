# Auto-Scaling Backend (WIP)

## WARNING: WORK IN PROGRESS. NOT READY FOR USE.

SwarmUI supports spreading across multiple backend systems, see [Using More GPUS](/docs/Using%20More%20GPUs.md) for info on this.

Along with this, SwarmUI also supports a native "Auto-Scaling Backend" - this is a pseudo-backend inside Swarm which has the purpose of automatically launching new backends on hardware scaling providers (eg Kubernetes, Slurm, etc.).

For obvious reasons, this is an advanced speciality functionality not intended for home users. This is for people who are paying big money for AI datacenter access. Some smaller scale providers do exist (such as Runpod) if you want to play with scaling capabilities.

## Setup

- First, install a "master" SwarmUI instance. Set this up with all the stuff you'd expect
    - Optionally with or without its own GPU and direct backends.
    - Include your models folder
    - Include any user configuration, and ensure storage space for user images, etc.
    - If using Slurm, this can be on your login node (no GPU) or a dedicated persistent node.
    - If you don't have GPUs on the master, it is recommended you still have your comfy backend, with `--cpu` in **ExtraArgs** and with **OverQueue** set to `-1`
    - Under **Server Configuration**, find **ModelLoadOrderPreference** and set it to **First Free** to ensure downscaling is stable.
- Then, on your scaling provider, install a "worker" instance
    - Same models folder as the master
    - Doesn't need any user config. You can, but leaving it as standard local is better.
        - If you enable user accounts on the workers, the master will need to connect to an account that has the `automated_control` permission
    - Firewalled away from the public internet is recommended for simplicity. Only the master needs to connect to it.
    - If using Slurm, this will run on your regular nodes.
    - Your actual Swarm launch script should probably use at least `--require_control_within 1` or higher (3+ recommended) to automatically shut down the instance if the master is not tracking it (otherwise you may get stray runs left behind eating provider cost for no reason)
    - It should probably also use `--no_persist true` to avoid the worker trying to save random data (multiple overlapping writes may corrupt)
        - Run the worker manually at least once at some point without this flag just to prefill caches that workers can read but shouldn't be actively writing, otherwise they will be slow to launch
    - If reusing the master swarm install, use at least a separate `--data-dir` for the worker vs the master. They can't have the same server settings. And also shouldn't.
- Configure a launch script
    - This should be a `.sh` script normally (if you're on Linux, which you should be for auto-scaling server stuff!)
    - Essentially, it just needs to launch a swarm worker and return some data
    - You are responsible for figuring out how scaling works on your provider. This is often a kubernetes or slurm call.
    - If using slurm, you will probably do something like `srun --nodes=1 --gpus=8 --exclusive --partition=wherever mywork.sh`
    - Data output is simple text in the stdout of the script, you can even just `echo "..."` it.
    - The output format is `[SwarmAutoScaleBackend]Key: value[/SwarmAutoScaleBackend]`
        - All inputs are case-sensitive.
        - Any stdout that does not fit the format is simply ignored
        - For debugging, check master server logs. Debug output with `Managed Output` prefix is used, or verbose with `startup stdout` for anything else.
    - For example, `export URL="http://192.168.0.1:7801/"; echo "[SwarmAutoScaleBackend]NewURL: $URL[/SwarmAutoScaleBackend]"`
    - Output `NewURL: <some url>` to declare a valid SwarmUI instance has spun up at the given URL.
        - The url must be accessible to the master swarm instance, and should be a direct http route to the swarm instance.
        - It does not have to boot instantly, Swarm will try to connect to it for a while.
            - Up to 30 seconds simple network wait (configurable in backend settings).
            - Output `DoRetries: <count>` to have it retry connecting multiple times on a connection failure.
                - There is a 5 second wait between retries.
                - Default count is 1 retry (ie 2 total attempts to connect).
                - Emit this setting *before* NewURL.
                - This is a weirdo option, primarily intended for if you have weird networks, extremely slow launch times, a need to emit a url *before* swarm launch, etc. Also serves to let you have some launches get more time to connect than others (vs the global timeout on the backend settings).
    - Output `DeclareFailed: <some reason>` to declare that scaling is not currently possible, and the server must make do with the resources it has.
    - If the script completes without giving a NewURL, critical failure will be presumed.
    - The script is not required to exit. As soon as NewURL is given, Swarm ignores the process and lets it run as long or short as it wants.
        - For slurm, this means that `srun` works and `sbatch` is not needed. You can still `sbatch` if you want.
    - Avoid any requeue style features of your scaling provider, and use a timeout. You want it to run or not run. A late requeue or very slow launch will just waste resources.
    - See the [sample scripts below](#sample-script)
- Configure the master instance:
    - In the UI, Go **Server** then **Backends**
    - Click to show advanced backends, and add a new **Auto Scaling Backend**
    - Give it the path to your launch script.
    - Click the `?` buttons on the backend settings to see info about how to configure the other options.
    - Click **Save** when you're done editing

## Tips

**(TODO: Configuration tips)**

## Sample Scripts

**(TODO: Sample scripts)**
