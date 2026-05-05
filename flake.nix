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
        appBundle = pkgs.runCommand "horaires-prof-app" {
          nativeBuildInputs = [ pkgs.nodejs_22 pkgs.typst ];
        } ''
          set -euxo pipefail
          export HOME="$TMPDIR"
          echo "== Copy source into build sandbox =="
          cp -r ${self} src
          chmod -R u+w src
          cd src

          echo "== Backend npm ci =="
          ${npm} --prefix backend ci --prefer-offline --no-audit --progress=false --loglevel verbose
          echo "== Frontend npm ci =="
          ${npm} --prefix frontend ci --prefer-offline --no-audit --progress=false --loglevel verbose
          echo "== Backend build =="
          ${npm} --prefix backend run build
          echo "== Frontend build =="
          ${npm} --prefix frontend run build
          echo "== Prune backend dev dependencies =="
          ${npm} --prefix backend prune --omit=dev --no-audit --progress=false --loglevel verbose

          echo "== Assemble runtime bundle =="
          mkdir -p "$out/app"
          mkdir -p "$out/app/backend" "$out/app/frontend"
          cp -r backend/dist "$out/app/backend/dist"
          cp -r backend/node_modules "$out/app/backend/node_modules"
          cp backend/package.json "$out/app/backend/package.json"
          cp backend/package-lock.json "$out/app/backend/package-lock.json"
          cp -r frontend/dist "$out/app/frontend/dist"
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
      in {
        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.nodejs_22 devScript ];
        };

        apps.default = {
          type = "app";
          program = "${devScript}/bin/dev";
        };

        packages.dockerImage = pkgs.dockerTools.buildLayeredImage {
          name = "horaires-prof";
          tag = "latest";
          contents = [ appBundle pkgs.nodejs_22 pkgs.typst pkgs.bash ];
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
