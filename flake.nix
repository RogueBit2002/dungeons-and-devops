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

		/*packages.${system}.event-worker = pkgs.lib.dockerTools.buildImage {
			name = "event-worker";
			tag = "latest";
		};*/

/*
		packages.${system} = let 
			folders = builtins.readDir ./services;
			projectFiles = builtins.filter (i: i != null ) builtins.map (i: if pathExists (i + ./package.json) then (i + ./package.json) else null) (builtins.attrNames folders);
			projects = builtins.map (projectFile: 
				let 
					projectJSON = builtins.fromJSON (builtins.readFile projectFile);
					name = builtins.split "/" projectJSON.name;
				in { name = { path = projectFile + ./..; }; }
			) projectFiles;
		in
			builtins.foldl' (acc: p: let
			
			in acc // { "${p.name}" =  pkgs.stdenv.mkDerivation {
				inherit system;

				pname = p.name;
				src = ./.;

				buildInputs = packages;
				builder = "bash";
  
  				args = ["-c" "mkdir $out && echo Hello world > $out/hello.txt"];
			}; }) {} projects;*/
  	};
}
