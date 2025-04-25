# Installing SwarmUI per Linux distro
## Gentoo
### Web, non-docker package
1. [Enable](https://wiki.gentoo.org/wiki/Eselect/Repository#Add_ebuild_repositories_from_repos.gentoo.org) "gentooplusplus" repository: `eselect repository enable gentooplusplus`
2. Sync: `emerge --sync`
3. If you want to install the non-9999 version please add `~amd64` (or similar - depending on your architecture) in `accept_keywords` (e.g. `/etc/portage/package.accept_keywords/whatever_you_named_it.conf`) for the packages:
   * `sci-ml/sd-swarmui-web ~amd64`
   * `=acct-user/genai-0.1 ~amd64`
   * `=acct-group/genai-0.1 ~amd64`
   
   In case of 9999 versions:
   * `=sci-ml/sd-swarmui-web-9999 **`
   * `=acct-user/genai-9999 **`
   * `=acct-group/genai-9999 **`
5. As usual, install the package: `emerge -av sci-ml/sd-swarmui-web`
6. If `systemd` use flag is enabled, there will be a systemd service created called `swarmui`. You may use it for running SwarmUI. In order to do so:
   * `sudo systemctl enable swarmui`
   * `sudo systemctl start swarmui`
7. Upon first run the necessary packages will be installed. Runner which is actually executed is located here: `/opt/swarmui/swarmui_runner.sh`, the whole swarmui install - here: `/opt/swarmui/`; everything is run from the user `genai`
8. After the packages installation being successful (with systemd you can check like this: `sudo systemctl status swarmui`) just visit the web page in your browser `http://localhost:7801/` (if that port was busy by some other process - please check the swarmui service logs which port it actually used) and go through regular configuration process.
9. That's it. Enjoy!
10. P.S. if you've selected "desktop" USE flag there will appear a browser launcher with the link for SwarmUI - for Your convenience.

### Web, docker package
(Coming soon)

### Troubleshooting
Open an issue in [Github tracker](https://github.com/Eugeniusz-Gienek/gentooplusplus/issues)
