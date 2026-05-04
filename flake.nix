{
  description = "Horaires CEGEP dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        npm = "${pkgs.nodejs_22}/bin/npm";
        devScript = pkgs.writeShellScriptBin "dev" ''
          export PATH="${pkgs.nodejs_22}/bin:${pkgs.typst}/bin:$PATH"
          trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM
          ${npm} --prefix frontend install
          ${npm} --prefix backend install
          ${npm} --prefix frontend run dev &
          ${npm} --prefix backend run dev &
          wait
        '';
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_22 devScript ];
        };

        apps.default = {
          type = "app";
          program = "${devScript}/bin/dev";
        };
      });
}
