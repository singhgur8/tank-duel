# Weapon checklist

Each weapon below has an automated test (tests/descriptions.test.ts) that fires it in a real game simulation and checks every claim in its description. All 74 pass.

| Weapon | Description | What the test checks | Changed in this pass |
|---|---|---|---|
| Shell | A reliable standard round. Small blast. | ✓ One blast, radius 35 or less; a direct hit scores 30. |  |
| Heavy Shell | Bigger payload, bigger crater. | ✓ Crater more than twice the size of a Shell crater. |  |
| Megaton | Huge blast radius. Hard to miss with. | ✓ Blast radius 80+; a tank 100 px away still takes 25+. |  |
| Doomsday | Devastating mushroom-cloud blast that leaves a giant crater. | ✓ Mushroom-cloud (nuke) blast, radius 130+, removes 25,000+ px of ground. | Text fixed: it never cratered half the map. |
| Rail Slug | Very fast and flat. Ignores wind. Small blast, high damage. | ✓ Launches 1.3x faster than a Shell; same path with or without wind; blast 25 or less, 45+ on a hit. |  |
| Ion Orb | Slow, floaty plasma orb with a crackling electric blast. | ✓ Slower than a Shell and stays in the air longer; plasma blast. |  |
| Frost Bomb | Shatters into a shower of ice shards and leaves drifts of snow that stay on the map. | ✓ 6+ ice shards with ice blasts; 800+ px of white snow left on the map. | Now leaves snow that stays. |
| Excavator | Scoops out an enormous crater but barely scratches armour. | ✓ Crater 1.4x bigger than Megaton; 12 or less damage on a hit. |  |
| Thunderbolt | Calls lightning down on the spot it lands. Hits hard in a narrow column. | ✓ Lightning strike; 45+ on target, 0 at 80 px (narrow). |  |
| Earthquake | Shakes the ground around the impact, cracking hills and rattling every tank nearby. | ✓ Ground quake; a tank 150 px away is damaged; ground cracks. |  |
| Trio | Three shells in a tight fan. | ✓ 3 shells, fan 3-8 degrees. |  |
| Quintet | Five shells in a wide fan. | ✓ 5 shells, fan 10-14 degrees. |  |
| Burst Fire | Four rounds fired in quick succession. | ✓ 4 rounds on one line, fired over 0.3+ s. |  |
| Splitter | Splits into five warheads at the top of its arc. | ✓ 5 warheads released at the top of the arc, heading downrange. |  |
| Cluster Bomb | Explodes and scatters bomblets around the target. | ✓ 6+ bomblets that land on both sides of the impact. |  |
| Hailstorm | Splits at the top of its arc into a spray of hail pellets that carry on along the same path and pepper the area around the target, leaving a dusting of snow. | ✓ 14 pellets at the top of the arc, heading downrange; 10+ ice blasts; snow left behind. | Now carries on along its arc and leaves snow (it used to drop straight down). |
| Jumping Jack | Hops forward exploding five times. | ✓ Exactly 5 blasts, each further forward than the last. | Hops hit harder. |
| Chain Gun | A rattling stream of eight small rounds. | ✓ 8 rounds, fired over 0.4+ s. |  |
| Scattergun | Seven pellets in a wide cone. Deadly up close. | ✓ 7 pellets, cone 14-18 degrees; 40+ against a tank 70 px away. |  |
| Fireworks | Bursts at its peak into a ring of colourful stars that fall as little blasts. | ✓ 18 stars in 3+ colours flying out in a ring; 15+ small blasts. | Stars hit harder. |
| Airstrike | Splits at the top of its arc into a line of seven bombs that fly on side by side and land in a row across the target. | ✓ 7 bombs at the top of the arc, 30+ px apart, flying together downrange. | Now carries on along its arc (it used to drop straight down). |
| Acid Rain | Splits at the top of its arc into a cloud of corrosive drops that follow the same path and splash down across the target area. | ✓ 20 drops at the top of the arc, heading downrange; 15+ acid splashes. | Now carries on along its arc (it used to drop straight down). |
| Swarm | Releases three small seekers at its peak that hunt the enemy. | ✓ 3 homing seekers at the top of the arc; they land nearer the enemy than the shooter. | Seekers could lock onto the shooter. Fixed, and they turn harder. |
| Ripple | Each blast kicks out two more, which kick out two more. Point-blank, it can go off again and again inside a tank. | ✓ Exactly 7 blasts (1, 2, 4). |  |
| Big Ripple | A longer chain of rippling blasts that spreads across the ground. | ✓ More blasts than Ripple, spread 120+ px across the ground. |  |
| Ripple Storm | Every blast throws out three more, four generations deep. Devastating if it starts inside the enemy. | ✓ Exactly 40 blasts (1, 3, 9, 27: four generations). Point-blank beats a ranged hit (separate test). |  |
| Roller | Lands and rolls downhill, exploding when it stops or hits a tank. | ✓ Rolls on landing, then one blast; rolling into a tank scores 35+. |  |
| Heavy Roller | A big roller with a big bang. | ✓ Blast radius 70+. |  |
| Bouncer | Bounces four times, popping on every bounce. | ✓ On open ground: exactly 4 bounces, each with a small pop. | Sometimes stopped bouncing early. Now uses all its bounces. |
| Seeker | Locks on to the enemy after its peak and steers in. | ✓ Fired short, lands 50+ px closer to the enemy than a Shell fired the same way. |  |
| Tunneler | Bores a long tunnel through the ground. Great for escaping or undermining. | ✓ Removes 4,000+ px and leaves a long underground tunnel. |  |
| Bunker Buster | Drills deep before detonating underground. | ✓ Blast 40+ px below the surface. |  |
| Laser Lance | A straight beam. No gravity, no wind. Burns through hills. | ✓ Beam hits a tank behind a 200 px hill in strong wind (30+ damage). |  |
| Triple Roller | Three rollers at once, fanned slightly apart. | ✓ 3 rollers, at least 2 rolling at once. |  |
| Wild Ball | A super-bouncy ball that ricochets eight times before it goes off. | ✓ On open ground: exactly 8 bounces, then one blast. | Sometimes stopped bouncing early. Now uses all its bounces. |
| Pile Driver | Flies a normal arc, then drives a spike straight down into the ground where it lands and blows up underneath. | ✓ Normal arc; spike spawns only after landing and goes straight down; big blast 40+ px under the ground. | Now flies a full arc before drilling (it used to stop mid-air). |
| Mole Swarm | Digs in, then splits into four burrowers that tunnel outward and blow up. | ✓ 4 burrowers whose blasts are spread 100+ px apart. | Burrowers spread wider and hit harder. |
| Tracer | A harmless sighting round. Its full path stays on screen so you can line up the next shot. | ✓ Path kept on screen; no damage, no crater, no blast. |  |
| Fuse Grenade | Bounces and rolls around, then goes off exactly 3.5 seconds after launch. | ✓ Bounces, then one blast 3.5 s after launch (within 0.05 s). | Went off early on hitting a tank. Now it glances off and waits for 3.5 s. |
| Proximity Shell | Bursts in mid-air as soon as it passes close to an enemy tank. | ✓ Bursts in mid-air within 50 px of the enemy; 20+ damage. |  |
| Crawler | Lands and drives on along the ground for up to five seconds, climbing hills, and blows up on contact. | ✓ Drives 4-5.6 s and over a hill; driving into a tank scores 35+. |  |
| Boomerang | Curves back toward you in flight. Lob it past the enemy and let it come home. Can hit you too. | ✓ Sideways speed reverses during flight. |  |
| Breaker | A short, wide blast straight out of the barrel. Smashes through dirt and anything right in front of you. | ✓ 35+ to a tank 110 px away, 0 at 400 px; digs 1,000+ px when aimed into the ground. |  |
| Warp Shell | Teleports your tank to wherever the shell lands. | ✓ Shooter ends up within 10 px of the landing spot. |  |
| Gust Bomb | A blast of air that flings tanks away. Little damage, but it can toss them into craters. | ✓ Tank thrown 40+ px further away; 10 or less damage. |  |
| Vortex | Sucks nearby tanks in toward the impact, then pops. | ✓ Tank pulled 15+ px closer, then one blast. |  |
| Lucky Dip | Nobody knows what is inside: a big blast, fire, a dirt dump, bomblets, lightning, or a damp squib. | ✓ Over 30 shots all six outcomes appear. |  |
| Long Shot | One time in four it is the biggest blast in the game. The rest of the time it fizzles. | ✓ Over 120 shots, 15-35% are the biggest blast in the game; the rest fizzle. |  |
| Napalm | Sticky fire that flows downhill and burns anything it touches. | ✓ 10+ flames that drift downhill; a tank in the fire takes 30+. |  |
| Inferno | A huge napalm spill. | ✓ 1.4x more flames than Napalm. |  |
| Volcano | Erupts on impact, hurling burning lava bombs up and around. | ✓ 10+ lava bombs thrown upward; 10+ fire blasts. |  |
| Dirt Ball | Dumps a ball of dirt. Bury your enemy. | ✓ Adds 15,000+ px of dirt and covers the tank. | Dumps about twice as much dirt. |
| Earth Wall | Raises a tall hill where it lands. Instant cover. | ✓ Ground rises 150+ px. | Bigger hill. |
| Dirt Shower | Splits at the top of its arc into clods of dirt that fly on and pile up around the target. | ✓ 18 clods at the top of the arc, heading downrange; 5,000+ px of dirt added. | Now carries on along its arc and drops much more dirt. |
| Leveler | Flattens the ground around the impact. | ✓ Ground within 70 px of the impact ends up flat (3 px or less). |  |
| Spire | Raises a tall, narrow pillar of rock. Blocks low shots. | ✓ Rises 250+ px, under 60 px rise 50 px away; blocks a low shot. | Taller and wider. |
| Bunker Dome | Builds a hollow arch of dirt over the landing spot. Shelter yourself or box in the enemy. | ✓ Hollow inside, solid arch above; a shell on top does under 10 to the tank inside. | Bigger and twice as thick. |
| Mudslide | Bursts into blobs of mud that roll downhill and fill the low ground. | ✓ 10+ blobs, several rolling at once; the lowest ground nearby rises. | Mud stopped on slopes and never filled low ground. Now it oozes downhill. |
| Springwall | Raises a tall wall of springy rubber that stays for the rest of the game. Shots bounce straight off it and small blasts cannot break it. | ✓ Rubber wall that stays; a small blast does not break it; a flat shot bounces back. |  |
| Rubber Coat | Coats a wide patch of ground in rubber that stays put. Shots landing on it bounce away instead of digging in. | ✓ Ground becomes rubber across the patch; a shell landing on it bounces away. |  |
| Brain Fog | A pink haze that scrambles the aim of every enemy tank it lands near: their angle and power are thrown to random values, and CPU players aim badly on their next turn. | ✓ Enemy angle and power change and they are dazed. |  |
| Bounce Funnel | Builds a V-shaped rubber funnel that stays on the map. Shots that drop into it rattle down to its throat; shots that hit the outside bounce away. | ✓ A shell dropped in ends near the throat; a shell hitting the outside bounces back. |  |
| Spring Ramp | Lays a rubber ramp that rises in the direction you fired. Anything that lands on it is flung back up into the air. Stays on the map. | ✓ Ramp rises in the direction fired; a falling shell is thrown back up. |  |
| Snowdrift | Dumps a huge pile of snow. It settles and stays like dirt. Bury your enemy in white. | ✓ Pile 70+ px tall, white, and covers a tank. |  |
| Blizzard | Splits at the top of its arc into a flurry of snowballs that fly on, sting a little and blanket the target area in snow. | ✓ 16 snowballs at the top of the arc; blasts 20 or less; 3,000+ px of snow. |  |
| Kettle Pop | Bursts into hot kernels that skitter around and pop one after another, each pop flinging out more. | ✓ 20+ pops spread over 1+ s, 20+ kernels, 5+ bounces. |  |
| Singularity | Opens a tiny black hole that drags nearby tanks toward it for a second, then collapses with a violent burst. | ✓ Tank pulled 20+ px closer; burst 1-1.4 s after landing; 20+ damage. |  |
| Phase Shell | Ghosts straight through hills and walls. Goes off when it gets close to a tank, or after six seconds. | ✓ Flies through a 600 px wall to hit (15+); with nothing near, goes off at about 6 s. | Triggers from further away. |
| Mirror Shell | At the top of its arc it splits off a twin that races back the opposite way and lands well behind you. Covers both sides of the map. | ✓ Twin flies the opposite way while the original carries on; the twin lands behind the shooter. | The twin used to land on the shooter. Now it lands well behind. |
| Pickpocket | Barely scratches the paint, but steals 20 points from every tank it lands near and hands them to you, even if that leaves them below zero. | ✓ Victim loses 20, shooter gains 20+, can push a victim below zero; blast 15 or less. | Text updated: it can now push a victim below zero. |
| Switcheroo | Land it near a tank and you swap places with it. Steal the high ground or dump someone into a pit. | ✓ The two tanks swap places. |  |
| Orbital Lance | A marker round. A moment after it lands, a beam from orbit cuts a deep trench straight down through the spot. | ✓ Beam comes 0.6+ s after landing and cuts a trench 120+ px deep but narrow. |  |
| Echo Charge | Goes off three times in the same spot, each blast bigger than the last and digging deeper. | ✓ 3 blasts at the same spot, each bigger than the last. |  |
| Twin Crawlers | Splits into two crawlers on landing, one driving each way along the ground. | ✓ 2 crawlers driving opposite ways; one blast ends on each side. | Crawlers got stuck in their own crater. Now they launch clear. |
