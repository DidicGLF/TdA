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
  '';
}
