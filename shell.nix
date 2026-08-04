with import <nixpkgs> {};
mkShell {
  nativeBuildInputs = [
    nodejs
    pkg-config
  ];
  buildInputs = [
    at-spi2-atk
    atk
    cairo
    dbus
    gdk-pixbuf
    glib
    gtk3
    harfbuzz
    librsvg
    libsoup_3
    openssl
    pango
    webkitgtk_4_1
  ];
  shellHook = ''
    export LD_LIBRARY_PATH="${lib.makeLibraryPath [
      at-spi2-atk atk cairo dbus gdk-pixbuf glib gtk3 harfbuzz librsvg libsoup_3 openssl pango webkitgtk_4_1
    ]}:$LD_LIBRARY_PATH"
    # Sans ça, GLib ne trouve pas le schéma "org.gtk.Settings.FileChooser" (contrairement à une
    # install système classique, où les schémas de tous les paquets GTK atterrissent dans un même
    # /usr/share/glib-2.0/schemas compilé ensemble) — le sélecteur de fichier natif de WebKitGTK
    # échoue alors silencieusement à l'ouverture (erreur GLib-GIO-ERROR dans le terminal, aucun
    # dialogue ne s'affiche), ce qui casse tout import de fichier (.json) dans l'app.
    export XDG_DATA_DIRS="${gtk3}/share/gsettings-schemas/${gtk3.name}:$XDG_DATA_DIRS"
  '';
}
