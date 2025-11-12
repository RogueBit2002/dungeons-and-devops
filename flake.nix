{
	description = "dndevops development environment";

	inputs = {
		nixpkgs.url = "github:nixos/nixpkgs/nixos-25.05";
	};

	outputs = { self, nixpkgs, ... } @ inputs: let
		system = "x86_64-linux";
		pkgs = import nixpkgs { inherit system; config.allowUnfree = true; };
		
		packages = with pkgs; [
			pnpm
			nodejs_22
		];
	in {
		devShell.${system} = pkgs.mkShell {
			name = "dndevops";
			
			inherit packages;

			shellHook = ''
				echo "Have fun developing! <3"
			'';
        };

		packages.${system}.event-worker = pkgs.lib.dockerTools.buildImage {
			name = "event-worker";
			tag = "latest";
		};
  	};
}
