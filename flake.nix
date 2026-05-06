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
        workspacePath =
          let pwd = builtins.getEnv "PWD";
          in if pwd != "" then pwd else toString ./.;
        runtimeSource = builtins.path {
          path = workspacePath;
          name = "horaires-prof-runtime-source";
          filter = path: type:
            let
              root = toString workspacePath;
              full = toString path;
              rel = pkgs.lib.removePrefix "${root}/" full;
            in
              rel == ""
              || rel == "backend"
              || rel == "backend/dist"
              || rel == "backend/node_modules"
              || rel == "frontend"
              || rel == "frontend/dist"
              || rel == "teachers"
              || rel == "backend/package.json"
              || rel == "backend/package-lock.json"
              || rel == "frontend/package.json"
              || rel == "frontend/package-lock.json"
              || rel == "template.typ"
              || rel == "base_horaire.typ"
              || rel == "DICJ_LOGO.png"
              || rel == "CEGEP_LOGO.png"
              || pkgs.lib.hasPrefix "backend/dist/" rel
              || pkgs.lib.hasPrefix "backend/node_modules/" rel
              || pkgs.lib.hasPrefix "frontend/dist/" rel
              || pkgs.lib.hasPrefix "teachers/" rel;
        };
        appBundle = pkgs.runCommand "horaires-prof-app" {
          nativeBuildInputs = [ pkgs.findutils ];
        } ''
          set -euxo pipefail
          echo "== Copy prebuilt runtime artifacts =="
          cp -r ${runtimeSource} src
          chmod -R u+w src
          cd src

          if [ ! -d backend/dist ]; then
            echo "Missing backend/dist. Run: nix develop -c npm --prefix backend run build"
            exit 1
          fi
          if [ ! -d frontend/dist ]; then
            echo "Missing frontend/dist. Run: nix develop -c npm --prefix frontend run build"
            exit 1
          fi
          if [ ! -d backend/node_modules ]; then
            echo "Missing backend/node_modules. Run: nix develop -c npm --prefix backend ci"
            exit 1
          fi

          mkdir -p "$out/app"
          cp -r backend "$out/app/backend"
          cp -r frontend "$out/app/frontend"
          cp -r teachers "$out/app/teachers"
          cp template.typ base_horaire.typ DICJ_LOGO.png CEGEP_LOGO.png "$out/app/"

          echo "== Remove runtime-unneeded cache/docs/artifacts =="
          rm -rf "$out/app/backend/node_modules/.cache"
          find "$out/app/backend/node_modules" -type d \( -name "test" -o -name "tests" -o -name "__tests__" -o -name "docs" -o -name "doc" \) -prune -exec rm -rf {} +
          find "$out/app/backend/node_modules" -type f \( -name "*.md" -o -name "*.markdown" -o -name "*.map" \) -delete
          echo "== Bundle complete =="
        '';
        devScript = pkgs.writeShellScriptBin "dev" ''
          export PATH="${pkgs.nodejs_22}/bin:${pkgs.typst}/bin:$PATH"
          trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM
          ${npm} --prefix frontend install
          ${npm} --prefix backend install
          ${npm} --prefix frontend run dev &
          ${npm} --prefix backend run dev &
          wait
        '';
        dockerBuildScript = pkgs.writeShellScriptBin "docker-build" ''
          set -euo pipefail
          export PATH="${pkgs.nodejs_22}/bin:${pkgs.nix}/bin:$PATH"
          echo "== Backend deps/build =="
          ${npm} --prefix backend ci
          ${npm} --prefix backend run build
          echo "== Frontend deps/build =="
          ${npm} --prefix frontend ci
          ${npm} --prefix frontend run build
          echo "== Docker image build =="
          nix build --impure .#dockerImage --option eval-cache false -L
          echo "Done. Load with: docker load < result"
        '';
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_22 devScript ];
        };

        apps.default = {
          type = "app";
          program = "${devScript}/bin/dev";
        };
        apps.docker-build = {
          type = "app";
          program = "${dockerBuildScript}/bin/docker-build";
        };

        packages.dockerImage = pkgs.dockerTools.buildLayeredImage {
          name = "horaires-prof";
          tag = "latest";
          contents = [ appBundle pkgs.nodejs_22 pkgs.typst ];
          config = {
            WorkingDir = "/app";
            Env = [
              "PORT=4000"
              "PATH=/bin"
            ];
            ExposedPorts = {
              "4000/tcp" = { };
            };
            Cmd = [ "/bin/node" "/app/backend/dist/server.js" ];
          };
        };
      });
}
