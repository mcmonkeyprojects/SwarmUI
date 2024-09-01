#!/bin/bash

# Check if GPU type is provided
if [ $# -eq 0 ]; then
    echo "Error: GPU type not specified. Please use 'amd' or 'nv' as an argument."
    exit 1
fi

GPU_TYPE=$1

# Validate GPU type
if [ "$GPU_TYPE" != "amd" ] && [ "$GPU_TYPE" != "nv" ]; then
    echo "Error: Invalid GPU type. Please use 'amd' or 'nv'."
    exit 1
fi

mkdir dlbackend

cd dlbackend

git clone https://github.com/comfyanonymous/ComfyUI

cd ComfyUI

python=`which python3`
if [ "$python" == "" ]; then
    >&2 echo ERROR: cannot find python3
    >&2 echo Please follow the install instructions in the readme!
    exit 1
fi

venv=`python3 -m venv 2>&1`
case $venv in
    *usage*)
        :
    ;;
    *)
        >&2 echo ERROR: python venv is not installed
        >&2 echo Please follow the install instructions in the readme!
        >&2 echo If on Ubuntu/Debian, you may need: sudo apt install python3-venv
        exit 1
    ;;
esac

if [ -z "${SWARM_NO_VENV}" ]; then
    python3 -s -m venv venv
    . venv/bin/activate
fi

# Install PyTorch based on GPU type
if [ "$GPU_TYPE" == "nv" ]; then
    python3 -s -m pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu124
elif [ "$GPU_TYPE" == "amd" ]; then
    python3 -s -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm6.1
fi

python3 -s -m pip install -r requirements.txt

echo "Installation completed for $GPU_TYPE GPU."
