// import { DepthMap, SupportedModels, createEstimator } from "@tensorflow-models/depth-estimation";
// import { Rank, tensor, Tensor } from "@tensorflow/tfjs";

// export class DepthEstimator {
//     estimator: any;
//     constructor() {}

//     async init() {
//         const model = SupportedModels.ARPortraitDepth;
//         const estimator = await createEstimator(model);
//         this.estimator = estimator;
//     }

//     async estimate(cameraImage: Tensor<Rank>, maxDepth: number, minDepth: number) {
//         const result: DepthMap = await this.estimator.estimateDepth(cameraImage, {
//             maxDepth: 10,
//             minDepth: 0.1,
//         });
//         return result;
//     }

//     public webGlTextureToTensor(texture: WebGLTexture, width: number, height: number): Tensor<Rank> {
//         // https://js.tensorflow.org/api/latest/ -> grep `texture`
//         const t = tensor({ texture, height, width, channels: "RGB" });
//         return t;
//     }
// }
