const response=await fetch(`https://api.vercel.com/v2/teams/${process.env.VERCEL_ORG_ID}`,{headers:{Authorization:`Bearer ${process.env.VERCEL_TOKEN}`}});
const team=await response.json();if(!response.ok||team.billing?.plan!=='hobby')throw new Error('Free Hobby plan is required.');
console.log('Verified free Hobby plan; no paid features enabled.');
