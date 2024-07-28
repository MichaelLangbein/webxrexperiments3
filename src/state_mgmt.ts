import { AsyncQueue } from './async';

export type Planet =
    | 'sun'
    | 'mercury'
    | 'venus'
    | 'earth'
    | 'moon'
    | 'mars'
    | 'jupiter'
    | 'saturn'
    | 'uranus'
    | 'neptune';

interface IAction {
    type: string;
    payload: any;
}

interface AppInit extends IAction {
    type: 'app init';
    payload: {};
}

interface AppExit extends IAction {
    type: 'app exit';
    payload: {};
}

interface SessionStart extends IAction {
    type: 'session start';
    payload: {};
}

interface SessionStop extends IAction {
    type: 'session stop';
    payload: {};
}

interface Play extends IAction {
    type: 'play';
    payload: {};
}

interface Pause extends IAction {
    type: 'pause';
    payload: {};
}

interface Gazing extends IAction {
    type: 'Gazing';
    payload: { planet: Planet; fraction: number };
}

interface Selection extends IAction {
    type: 'selection';
    payload: { planet: Planet };
}

export type Action = AppInit | AppExit | SessionStart | SessionStop | Play | Pause | Gazing | Selection;

export interface State {
    vrActive: boolean;
    running: boolean;
    gazedPlanet?: Planet;
    selectedPlanet?: Planet;
}

export type Listener = (state: State) => void;

export class StateMgmt {
    private listeners: Listener[] = [];
    private queue: AsyncQueue = new AsyncQueue();

    constructor(private state: State) {}

    getCurrentState() {
        return { ...this.state };
    }

    listen(listener: Listener) {
        this.listeners.push(listener);
    }

    handleAction(action: Action) {
        this.state = this.reduce(action, this.state);
        this.listeners.map((l) => l(this.state));
        this.queue.enqueue(async () => {
            const newState = await this.sideEffects(action, this.state);
            this.state = newState;
            this.listeners.map((l) => l(this.state));
        });
    }

    private reduce(action: Action, state: State): State {
        state.gazedPlanet = undefined;
        switch (action.type) {
            case 'app init':
                return {
                    ...state,
                    vrActive: true,
                    running: true,
                };
            case 'app exit':
                return {
                    ...state,
                    vrActive: false,
                };
            case 'Gazing':
                if (action.payload.planet === state.selectedPlanet) return state;
                if (action.payload.fraction < 1.0) {
                    return {
                        ...state,
                        gazedPlanet: action.payload.planet,
                    };
                } else {
                    return {
                        ...state,
                        gazedPlanet: undefined,
                        selectedPlanet: action.payload.planet,
                    };
                }
            case 'selection':
                return {
                    ...state,
                    selectedPlanet: action.payload.planet,
                };
            case 'play':
                return {
                    ...state,
                    running: true,
                };
            case 'pause':
                return {
                    ...state,
                    running: false,
                };
        }
        return this.state;
    }

    private async sideEffects(action: Action, state: State): Promise<State> {
        switch (action.type) {
        }
        return state;
    }
}
