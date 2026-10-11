const response=await fetch(process.env.SERVER_URL+'/api/health');
const data: {games: string[]}=await response.json();
if(!response.ok || JSON.stringify(data.games)!==JSON.stringify([process.env.EXPECTED_GAME])) throw Error('Dedicated deployment must register only the expected game');
