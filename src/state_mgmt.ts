import { AsyncQueue } from './async';

type Planet = 'sun' | 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

interface IAction {
    type: string;
    payload: any;
}

interface AppInit extends IAction {
    type: 'app init';
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
    payload: { planet: Planet };
}

interface Selection extends IAction {
    type: 'selection';
    payload: { planet: Planet };
}

export type Action = AppInit | SessionStart | SessionStop | Play | Pause | Gazing | Selection;

export interface State {
    running: boolean;
    planets: Planet[];
    selectionFraction?: number;
    gazedPlanet?: Planet;
    selectedPlanet?: Planet;
}

export type Listener = (state: State) => void;

export class StateMgmt {
    private listeners: Listener[] = [];
    private queue: AsyncQueue = new AsyncQueue();

    constructor(private state: State) {}

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
            case 'Gazing':
                const selectionFraction = state.selectionFraction ? state.selectionFraction + 0.1 : 0.1;
                if (selectionFraction < 1.0) {
                    return {
                        ...state,
                        selectionFraction,
                        gazedPlanet: action.payload.planet,
                    };
                } else {
                    return {
                        ...state,
                        selectionFraction: undefined,
                        gazedPlanet: undefined,
                        selectedPlanet: action.payload.planet,
                    };
                }
            case 'selection':
                return {
                    ...state,
                    selectionFraction: undefined,
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
        return this.state;
    }
}
