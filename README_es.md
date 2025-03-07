# SwarmUI

**SwarmUI v0.9.5 Beta**.

Conocido anteriormente como StableSwarmUI.

Una interfaz de usuario web modular para la generación de imágenes con IA, con especial énfasis en la facilidad de acceso a las herramientas, el alto rendimiento y la extensibilidad. Soporta modelos de imagen de IA (Stable Diffusion, Flux, etc.), y modelos de vídeo de IA (LTX-V, Hunyuan Video, Cosmos, Wan, etc.), con planes para soportar por ejemplo audio y más en el futuro.

![ui-screenshot](.github/images/swarmui.jpg)

Unete al [Discord](https://discord.gg/q2y38cqjNw) para hablar del proyecto, obtener apoyo, ver comunicados, etc.
Sigue el [Feature Announcements Thread](https://github.com/mcmonkeyprojects/SwarmUI/discussions/1) para actualiazciones en nuevas caracteristicas.

----

# Estatus

Este proyecto se encuentra en estado **Beta**. Esto significa que para la mayoría de las tareas, Swarm tiene excelentes herramientas a su disposición, pero hay mucho más planeado. Swarm se recomienda como una interfaz de usuario ideal para la mayoría de los usuarios, principiantes y profesionales por igual. Aún quedan algunas cosas por pulir.

A los usuarios principiantes les encantará la interfaz principal de la pestaña Generate de Swarm, que facilita la generación de cualquier cosa con una variedad de potentes funciones. Los usuarios avanzados pueden preferir la pestaña Comfy Workflow para obtener el gráfico en bruto sin restricciones, pero seguirán teniendo motivos para volver a la pestaña Generate por las funciones prácticas (editor de imágenes, generación automática de flujos de trabajo, etc.) y las herramientas potentes (por ejemplo, Grid Generator).

Aquellos interesados en ayudar a que Swarm pase de Beta a un estado de Release completamente listo para cualquier cosa son bienvenidos a enviar PRs (lee el documento [Contributing](/CONTRIBUTING.md) primero), y puedes contactarnos aquí en GitHub o en [Discord](https://discord.gg/q2y38cqjNw). Se recomienda encarecidamente ponerse en contacto para preguntar acerca de los planes para una característica antes del PRing. Puede que ya haya planes específicos o incluso un trabajo en curso.


Características clave aún no implementadas:
- Mejor compatibilidad con navegadores móviles
- Visualización detallada del «modelo actual» en la interfaz de usuario, separada del selector de modelos (¿Probablemente como una pestaña dentro de la barra lateral de lotes?)
- Prompting asistido por LLM (existe una extensión para ello, pero el control de LLM debería estar soportado de forma nativa)
- Distribución directa conveniente de Swarm como programa ([Tauri](https://tauri.app/), [Blazor Desktop](https://learn.microsoft.com/en-us/training/modules/build-blazor-hybrid/), o ¿una aplicación Electron?)


# Pruebalo en Google Colab

### Google Colab

**PRECAUCION**: Google Colab no necesariamente permite WebUIs remotas, particularmente para cuentas gratuitas, úsalo bajo tu propio riesgo.

Link de Colab si quieres probar Swarm: https://colab.research.google.com/github/mcmonkeyprojects/SwarmUI/blob/master/colab/colab-notebook.ipynb

# Ejecútalo en un proveedor de GPU en la nube

### Runpod

Plantilla de Runpod (Nota: Mantenido por un tercero [nerdylive123](https://github.com/nerdylive123)): https://runpod.io/console/deploy?template=u7mlkrmxq3&ref=c6jd6jj0

### Vast.ai

Plantilla de Vast.ai ([readme](https://cloud.vast.ai/template/readme/8e5e6ab1fceb9db3f813e815907b3390)): https://cloud.vast.ai?template_id=21b140f47ee8d4ebb2ce836afe2f9ad9

Tenga en cuenta que puede tardar varios minutos en arrancar la primera vez. Compruebe los registros del contenedor para ver el progreso de la configuración. Consulte la información de la plantilla `?` para obtener consejos sobre su uso.

# Instalar en Windows

Nota: Si estás en Windows 10, es posible que tengas que instalar manualmente [git](https://git-scm.com/download/win) y [DotNET 8 SDK](https://dotnet.microsoft.com/en-us/download/dotnet/8.0) primero. (En Windows 11 esto está automatizado).


- Descarga [El archivo Install-Windows.bat](https://github.com/mcmonkeyprojects/SwarmUI/releases/download/0.9.5-Beta/install-windows.bat), guárdalo en algún lugar donde quieras instalar (no en `Archivos de Programa`), y ejecútalo.
    - Debería abrir un símbolo del sistema e instalarse.
    - Si se cierra sin ir más lejos, intente ejecutarlo de nuevo, a veces necesita ejecutarse dos veces. (TODO: Arreglar eso)
    - Colocará un icono en tu escritorio que podrás utilizar para reiniciar el servidor en cualquier momento.
    - Cuando el instalador se complete, se iniciará automáticamente el servidor SwarmUI, y abrirá una ventana del navegador a la página de instalación.
    - Siga las instrucciones de instalación de la página.
    - Después de finalizar, ten paciencia, algunos de los procesos de instalación tardan unos minutos (descarga de modelos y etc).


(TODO): Un preinstalador autocontenido aún más sencillo, un `.msi` o `.exe` que ofrezca una pantalla de instalación general y permita elegir carpeta y todo.

# Instalación manual alternativa en Windows

- Instale git desde https://git-scm.com/download/win
- Instale DotNET 8 SDK desde https://dotnet.microsoft.com/en-us/download/dotnet/8.0 (Asegúrese de obtener el SDK x64 para Windows)
- Abra una terminal en la carpeta en la que desea el Swarm y ejecute `git clone https://github.com/mcmonkeyprojects/SwarmUI`
- Abra la carpeta y ejecute `launch-windows.bat`.


# Instalación en Linux

- Instala `git`, `python3` a través del gestor de paquetes de tu SO si no están ya instalados (asegúrate de incluir `pip` y `venv` en distros que no los incluyan en python directamente)
    - Por ejemplo, en versiones recientes de Ubuntu, `sudo apt install git python3-pip python3-venv`.
- Descarga [el archivo install-linux.sh](https://github.com/mcmonkeyprojects/SwarmUI/releases/download/0.6.5-Beta/install-linux.sh), guárdalo en algún lugar donde quieras instalar, y ejecútalo
    - Si te gustan las terminales, puedes abrir un terminal en la carpeta y ejecutar los siguientes comandos:
        - `wget https://github.com/mcmonkeyprojects/SwarmUI/releases/download/0.6.5-Beta/install-linux.sh -O install-linux.sh`
        - chmod +x instalar-linux.sh
- Ejecuta el script `./install-linux.sh`, instalará todo por ti y finalmente abrirá la página web en tu navegador.
- Siga las instrucciones de instalación de la página.

- En cualquier momento en el futuro puede ejecutar el script `launch-linux.sh` para relanzar Swarm.
- Si la página no se abre sola, puedes abrir manualmente `http://localhost:7801`.


# Instalación manual alternativa en Linux

- Instala `git`, `python3` a través del gestor de paquetes de tu sistema operativo si no están ya instalados (asegúrate de incluir `pip` y `venv` en las distribuciones que no los incluyan en python directamente).
    - Por ejemplo, en versiones recientes de Ubuntu, `sudo apt install git python3-pip python3-venv`.
    - Necesitarás Python 3.11.También debería funcionar bien con 3.10 o 3.12. No utilice 3.13.
- Instala DotNET 8 siguiendo las instrucciones de https://dotnet.microsoft.com/en-us/download/dotnet/8.0 (necesitas `dotnet-sdk-8.0`, ya que incluye todos los subpaquetes relevantes).
    - Algunos usuarios [han dicho](https://github.com/Stability-AI/StableSwarmUI/pull/6) que ciertas distribuciones de Linux esperan que `aspnet-runtime` se instale por separado.
- Abra un terminal shell y `cd` a un directorio en el que desea instalar
- Ejecuta los comandos de la shell:
    - `git clone https://github.com/mcmonkeyprojects/SwarmUI`
    - cd `SwarmUI`
    - `./launch-linux.sh`
    - o si se ejecuta en un servidor headless, `./launch-linux.sh --launch_mode none --host 0.0.0.0` y/o cambiar host por [cloudflared](/docs/Advanced%20Usage.md)
- Abrir `http://localhost:7801/Install` (si no se lanza solo)
- Siga las instrucciones de instalación de la página.

(TODO): Tal vez crear un documento dedicado con los detalles por-distro y lo que sea. ¿Tal vez también hacer un instalador de un clic para Linux?


# Instalación en Mac

> **Nota**: Sólo puede ejecutar SwarmUI en ordenadores Mac con procesadores Apple Silicon M-Series (por ejemplo, M1, M2, ...).

- Abre el Terminal.
- Asegúrate de que tus paquetes `brew` están actualizados con `brew update`.
- Verifica tu instalación de `brew` con `brew doctor`. No deberías ver ningún error en la salida del comando.
- Instala .NET para macOS: `brew install dotnet`.
- Si no tienes Python, instálalo: `brew install python@3.11` y `brew install virtualenv`.
    - Python 3.11, 3.10, 3.12 están bien. 3.13 no, no uses 3.13.
- Cambia el directorio (`cd`) a la carpeta donde quieres instalar SwarmUI.
- Clona el repositorio GitHub de SwarmUI: `git clone https://github.com/mcmonkeyprojects/SwarmUI`.
- Haz `cd SwarmUI` y ejecuta el script de instalación: `./launch-macos.sh`.
- Espere a que el navegador web se abra, y siga las instrucciones de instalación en la página.

# Instalación con Docker

Mira [Docs/Docker.md](/docs/Docker.md) para instrucciones detalladas sobre el uso de SwarmUI en Docker.

 Documentación

Véase [la carpeta de documentación](/docs/README.md).

# Motivaciones

El nombre "Swarm" hace referencia a la función clave original de la interfaz de usuario: permitir que un «enjambre» de GPUs generen imágenes para el mismo usuario a la vez (especialmente para grandes generaciones de cuadrículas). Esta es sólo la característica que inspiró el nombre y no el fin de todo lo que es Swarm.

El objetivo general de SwarmUI es ser una opcion todo en uno para todas las cosas de Stable Diffusion.

Ver [el documento de motivaciones](/docs/Motivations.md) para las motivaciones sobre las opciones técnicas.


# Legal

**Aviso Legal**

Este proyecto:
- Incorpora una copia de [7-zip](https://7-zip.org/download.html) (LGPL).
- Tiene la capacidad de autoinstalar [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (GPL).
- Tiene la opción de usar como backend [AUTOMATIC1111/stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui) (AGPL).
- Puede instalar automáticamente [christophschuhmann/improved-aesthetic-predictor](https://github.com/christophschuhmann/improved-aesthetic-predictor) (Apache2) y [yuvalkirstain/PickScore](https://github.com/yuvalkirstain/PickScore) (MIT).
- Puede instalar automáticamente [git-for-windows](https://git-scm.com/download/win) (GPLv2).
- Puede instalar automáticamente paquetes pip MIT/BSD/Apache2/PythonSoftwareFoundation: [spandrel](https://pypi.org/project/spandrel/), [dill](https://pypi.org/project/dill/), [imageio-ffmpeg](https://pypi.org/project/imageio-ffmpeg/), [opencv-python-headless](https://pypi.org/project/opencv-python-headless/), [matplotlib](https://pypi.org/project/matplotlib/), [rembg](https://pypi.org/project/rembg/), [kornia](https://pypi.org/project/kornia/), [Cython](https://pypi.org/project/Cython/)
- Puede instalar automáticamente [ultralytics](https://github.com/ultralytics/ultralytics) (AGPL) para la detección facial `YOLOv8` (es decir, el uso del nodo `SwarmYoloDetection` o la sintaxis `<segment:yolo-...>` puede estar sujeto a los términos de la licencia AGPL).
- Puede instalar automáticamente [insightface](https://github.com/deepinsight/insightface) (MIT) para la compatibilidad con `IP Adapter - Face`
- Utiliza [JSON.NET](https://github.com/JamesNK/Newtonsoft.Json) (MIT), [FreneticUtilities](https://github.com/FreneticLLC/FreneticUtilities) (MIT), [LiteDB](https://github.com/mbdavid/LiteDB) (MIT), [ImageSharp](https://github.com/SixLabors/ImageSharp/) (Apache2 bajo licencia dividida de código abierto)
- Incorpora copias de recursos web de [BootStrap](https://getbootstrap.com/) (MIT), [Select2](https://select2.org/) (MIT), [JQuery](https://jquery.com/) (MIT), [exifr](https://github.com/MikeKovarik/exifr) (MIT).
- Contiene algunos iconos de [Cristian Munoz](https://www.figma.com/community/file/1311159026125960259/7000-free-ui-icons) (CC-BY-4.0), la fuente [inter by rsms](https://github.com/rsms/inter) (OFL), [Unifont by GNU](https://unifoundry.com/unifont/) (OFL), [Material Symbols Outlined by Google](https://fonts.google.com/icons) (Apache2).
- Puede usarse para instalar algunos paquetes de nodos personalizados, los cuales tienen avisos de licencia individuales para cualquier licencia no puramente FOSS antes de la instalación.
- Soporta extensiones creadas por el usuario que pueden tener sus propias licencias o condiciones legales.

SwarmUI en sí tiene licencia MIT, sin embargo, algunos usos podrían verse afectados por las licencias variantes de GPL de los proyectos conectados listados anteriormente, y tenga en cuenta que cualquier modelo utilizado tiene sus propias licencias.

### Licencia Previa

(For updates prior to June 2024)

The MIT License (MIT)
Copyright (c) 2024 Stability AI

### Licencia

The MIT License (MIT)

Copyright (c) 2024-2025 Alex "mcmonkey" Goodwin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
