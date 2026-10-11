import metadata from '../package.json' with {type:'json'};
process.stdout.write(metadata.version);
