import {Channel} from '../js-caf/Channel.mjs';
import {FSM} from './FSM.mjs';

function delay(msec){
	return new Promise(res => {
		setTimeout(() => {res();}, msec);
	});
}

const fsmDef = {
	initState: 'Idle',

	states: {
		Idle: {
			transitions: {init: 'Idle', call: 'Alerting', origCall: 'GetNumber'},
			eventHandlers: {
				async init(fsm){
					let msg = await fsm.args.ch.get();
					switch(msg instanceof Array ? msg[0] : msg) {
						case 'offhook':
							fsm.log(`${fsm.name}: input ${msg} -> Idle`);
							return(fsm.events.origCall);

						case 'call':
							fsm.name = msg[1];
							fsm.args.otherParty = msg[2];
							fsm.log(`${fsm.name}: input [${msg[0]}, ${msg[1]}] -> Idle`);
							return(fsm.events.call);
					}
				},

				done(fsm){}
			}
		},

		GetNumber: {
			transitions: {number: 'Routing'},
			eventHandlers: {
				origCall(fsm){ return([fsm.events.number, '7204444444']); }
			}
		},

		Routing: {
			transitions: {accepted: 'Active'},
			eventHandlers: {
				async number(fsm, number){
					localRouterChan.send(['call', number, fsm.args.ch]);
					let msg = await fsm.args.ch.get();
					fsm.args.otherParty = msg[1];
					return(msg);
				}
			}
		},

		Active: {
			transitions: {done: 'Idle'},
			eventHandlers: {
				async accepted(fsm){
					const msg = await fsm.args.ch.get();

					switch(msg) {
						case 'onhook':
							fsm.log(`${fsm.name}: onhook`);
							fsm.args.otherParty.send('disconnect');
							return(fsm.events.done);
							break;

						case 'disconnect':
							return(fsm.events.done);
							break;
					}
				}
			}
		},

		Alerting: {
			transitions: {accepted: 'Active'},
			eventHandlers: { 
				async call(fsm, number){
					let msg = await fsm.args.ch.get();
					if(msg == 'offhook'){
						fsm.log(`${fsm.name}: offhook`);
						fsm.args.otherParty.send(['accepted', fsm.args.ch]);
						return(fsm.events.accepted);
					}
				}}
		}
	}
};

function startCallee([, number, caller]){
	const calleeChan = new Channel;
	callee(calleeChan);
	calleeChan.send(['call', number, caller]);
}

async function router(myChan, {args: {routeTable}}){
	while(true){
		const [eventName, number, caller] = await myChan.get();
		let routeTableKeys = Object.keys(routeTable).sort((a, b) => {return b-a;});
		const idx = routeTableKeys.findIndex((e) => number.substr(0, e.length) == e);
		routeTable[routeTableKeys[idx]]([eventName, number, caller]);
	}
};

async function caller(ch, {closeKey, getKey, setKey} = {}){
	const fsm = new FSM(fsmDef, {log: true, name: 'caller', args: {ch, origer: true, closeKey, getKey, setKey}});
	//fsm.name = 'caller';
	fsm.addEvent(fsm.events.init);
	while(fsm.moreEvents()){
		switch(await fsm.next()) {
			case 'Active':
				await delay(5000); // wait to end call
				ch.send('onhook');
				break;

			default:
		}
	}
};

async function callee(ch) {
	const fsm = new FSM(fsmDef, {log: true, name: 'callee', args: {ch}});
	//fsm.name = 'callee';
	fsm.addEvent(fsm.events.init);
	while(fsm.moreEvents()){
		switch(await fsm.next()) {
			case 'Alerting':
				await delay(2000); // wait to answer
				ch.send('offhook');
				break;

			default:
		}
	}
};

const localRouterChan = new Channel;
router(localRouterChan, {args: {
	routeTable: {
		'303444': startCallee ,
		'720': (msg)=>{router2Chan.send(msg);},
		'': ([event, number])=>{ console.log(`gw ${event} ${number}`); }
	}
}});

const router2Chan = new Channel;
router(router2Chan, {args: {
	routeTable: {
		'720444': startCallee ,
		'': ([event, number])=>{ console.log(`gw ${event} ${number}`); }
	}
}});

(async function origer() {
	const callerChan = new Channel;
	caller(callerChan);
	await callerChan.send('offhook');
})();
