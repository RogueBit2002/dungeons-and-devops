{
  description = "dndevops development environment";

  inputs = {
		nixpkgs.url = "github:nixos/nixpkgs/nixos-25.05";
		u-nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

		flake-utils.url = "github:numtide/flake-utils";
	};

	outputs = { self, nixpkgs, u-nixpkgs, ... }@inputs: let
		system = "x86_64-linux";
		pkgs = import nixpkgs { inherit system; config.allowUnfree = true; };
		u-pkgs = import u-nixpkgs { inherit system; config.allowUnfree = true; };
	in {
		devShell.${system} = pkgs.mkShell {
			name = "dndevops";
			
			packages = [
				#nodejs_22
				#figlet
				u-pkgs.zig
			];

			shellHook = ''
				echo Zig!
			'';
        };
  };
}
