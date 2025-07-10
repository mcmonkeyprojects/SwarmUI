#!/usr/bin/env bash

# Check if GPU type is provided
if [ $# -eq 0 ]; then
    >&2 echo "Error: GPU type not specified. Please use 'amd' or 'nv' as an argument."
    exit 1
fi

GPU_TYPE=$1

# Validate GPU type
if [ "$GPU_TYPE" != "amd" ] && [ "$GPU_TYPE" != "nv" ]; then
    >&2 echo "Error: Invalid GPU type. Please use 'amd' or 'nv'."
    exit 1
fi

mkdir dlbackend

cd dlbackend

git clone https://github.com/comfyanonymous/ComfyUI

cd ComfyUI

# Try to find a good python executable, and dodge unsupported python versions
for pyvers in python3.11 python3.10 python3.12 python3 python
do
    python=`which $pyvers`
    if [ "$python" != "" ]; then
        break
    fi
done
if [ "$python" == "" ]; then
    >&2 echo "ERROR: cannot find python3"
    >&2 echo "Please follow the install instructions in the readme!"
    exit 1
fi

# Validate venv
venv=`$python -m venv 2>&1`
case $venv in
    *usage*)
        :
    ;;
    *)
        >&2 echo "ERROR: python venv is not installed"
        >&2 echo "Please follow the install instructions in the readme!"
        >&2 echo "If on Ubuntu/Debian, you may need: sudo apt install python3-venv"
        exit 1
    ;;
esac

# Make and activate the venv. "python3" in the venv is now the python executable.
if [ -z "${SWARM_NO_VENV}" ]; then
    echo "Making venv..."
    $python -s -m venv venv
    source venv/bin/activate
    python=python3
    python3 -m ensurepip --upgrade
else
    echo "swarm_no_venv set, will not create venv"
fi

# Install PyTorch based on GPU type
if [ "$GPU_TYPE" == "nv" ]; then
    echo "install nvidia torch..."
    $python -s -m pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu124
elif [ "$GPU_TYPE" == "amd" ]; then
    echo "install amd torch..."
    $python -s -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm6.3
fi

echo "install general requirements..."
$python -s -m pip install -r requirements.txt

echo "Installation completed for $GPU_TYPE GPU."
