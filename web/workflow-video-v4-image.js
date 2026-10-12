(function(root) {
  const native=typeof module==='object'&&module.exports?require('./workflow-v3-beta.js'):root.KendoWorkflow;
  const api={...native,buildWorkflow(options){const graph=native.buildWorkflow(options);graph.save.inputs.filename_prefix='video/Kendo_H3_v4image';return graph;}};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.KendoWorkflow=api;
})(typeof window==='object'?window:globalThis);
