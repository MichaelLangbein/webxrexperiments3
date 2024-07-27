import { WebXRManager } from 'three';

export class HtsMgmt {
    constructor(private xr: WebXRManager) {}

    public getHts() {
        if (this.hts) return this.hts;
        this.loadHts();
        return undefined;
    }

    private hts?: XRHitTestSource;
    private requestOngoing = false;
    private loadHts() {
        if (this.requestOngoing) return;
        this.requestOngoing = true;
        const session = this.xr.getSession();
        if (!session || !session.requestHitTestSource) {
            this.requestOngoing = false;
            return;
        }
        session.requestReferenceSpace('viewer').then((viewerRefSpace) => {
            // @ts-ignore
            session.requestHitTestSource({ space: viewerRefSpace }).then((hts) => {
                this.hts = hts;
                this.requestOngoing = false;
            });
        });
        session.addEventListener('end', () => {
            this.requestOngoing = false;
            this.hts = undefined;
        });
    }
}
