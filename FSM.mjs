export {FSM};

// Validate the FSM definition
function validateFSMDef(def) {
	let transitions = [],
		eventHandlers = [],
		events = {};

	if(def?.initState == undefined || def.states[def.initState] == undefined){
		// initState not defined
		console.error(`initState ${def.initState} not defined or is not a state`);
		process.exit(1);
	}
	
	// Check FSM def if all states are reachable from initState
	let search = Object.values(def.states[def.initState].transitions).filter(e => e != def.initState),
		reached = [def.initState];

	// Compute reachable states
	while(search.length > 0){
		let state = search.shift();
		reached = [...new Set([...reached, state])];
		search = [...new Set([...search, ...def.states[state].transitions
			? Object.values(def.states[state].transitions).filter(x =>
				!reached.includes(x))
			: []
		])];
	}

	// Are FSM def states same as reached?
	let diff = Object.keys(def.states).filter(x => !reached.includes(x));
	if(diff.length != 0) {
		console.error(`error: state(s) "${diff}" not reachable`);
		process.exit(1);
	}

	// Check that there is a transition for each handler and vice versa
	Object.keys(def.states).forEach(state => {
		Object.entries(def.states[state].transitions).forEach(([event, nextState]) => {
			transitions[event] = nextState;
			events[event] = event;
		});
		Object.keys(def.states[state].eventHandlers).forEach(eventHandler => eventHandlers.push([eventHandler, state]));
	});

	if(Object.entries(transitions).length != eventHandlers.length) {
		console.error(`a transition doesn't have a handler or vice versa`);
		process.exit(1);
	}

	return events;
}

// FSM class
function FSM(def, {log, name, args} = {}){
	this.events = validateFSMDef(def);
	let {initState: currentState, states} = def;
	//Object.keys(args).forEach(e => this[e] = args[e]);
	const eventQueue = [];
	
	this.log = log ? (...args) => console.log(...args) : ()=>{};
	this.name = name;
	this.args = args;
	this.addEvent = (event) => eventQueue.push(event);
	this.moreEvents = () => eventQueue.length > 0;
	this.next = async () => {
		const event = eventQueue.shift();
		let [eventName, ...args] = event instanceof Array ? event : [event];
		let nextEvent = states[currentState].eventHandlers[eventName](this, ...args);
		if(nextEvent != undefined) {
			if(nextEvent instanceof Promise)
				nextEvent = await nextEvent;
			let nextEventName = nextEvent instanceof Array ? nextEvent[0] : nextEvent;
			let oldState = currentState;
			currentState = states[currentState]?.transitions[nextEventName];
			this.log(`${this.name} (${oldState}, ${nextEventName}) -> ${currentState}`);
			this.addEvent(nextEvent);
		}
		return currentState;
	};
}
