/* Standard Qwen Image 2.1 path, kept separate from the previous combined workflow. */
(function(root) {
  const native = typeof module==='object' && module.exports ? require('./workflow-images.js') : root.KendoImages;
  const MODELS = {qwen21:{...native.MODELS.qwen21,steps:25}};
  function buildWorkflow(options={}) {
    if(options.model && options.model!=='qwen21')throw new Error('V4 image generation uses Qwen Image 2.1');
    const graph=native.buildWorkflow({...options,model:'qwen21',steps:options.steps??25,resolution:options.resolution??2048});
    graph['8'].inputs.filename_prefix='Kendo_Qwen_V4';
    return graph;
  }
  function readiness(info,model='qwen21') {
    if(model!=='qwen21')throw new Error('Unsupported V4 image model');
    return native.readiness(info,model);
  }
  const api={MODELS,ENCODER:native.ENCODER,VAE:native.VAE,REQUIRED:native.REQUIRED,dimensions:native.dimensions,buildWorkflow,readiness};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.KendoQwenV4=api;
})(typeof window==='object'?window:globalThis);
