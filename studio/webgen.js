const shortText=maxLength=>({type:"string",maxLength});
const pageLayoutSchema=obj({
  title:shortText(90),basis:shortText(360),markup:shortText(2900),css:shortText(2600),interaction:shortText(380)
});
function bareCode(text){
  return String(text||"").trim().replace(/^```[\w-]*\s*|\s*```$/g,"").trim();
}
async function generateWeb(t,pictures,signal){
  const messages=buildMessages(t,pictures),layoutStep=choose("1/2 · 编排页面","1/2 · Designing the page");
  messages[0].content+=" This is the structure pass. Put only a compact HTML BODY FRAGMENT in markup, styles in css, and a one-sentence behavior contract in interaction. A second pass writes JavaScript. Give interactive elements unique IDs. Keep only the elements needed for the user's task. CSS: 8–14 short rules, no animations unless requested, no reset library. No document wrappers, script, style tags, comments, external resources or markdown fences.";
  let layout;
  for(let attempt=0;attempt<2;attempt++){
    try{
      layout=await modelJSON(messages,pageLayoutSchema,2100,layoutStep,signal);
      if(!/<[a-z][\s\S]*>/i.test(layout.markup)||!layout.title?.trim())throw new SyntaxError("Missing markup");
      break;
    }catch(err){
      if(signal.aborted||attempt||!(err instanceof SyntaxError||err.code==="length"))throw err;
      messages[0]={...messages[0],content:messages[0].content+" Simplify to one compact view under 700 characters of HTML and 650 of CSS. Use one working interaction."};
    }
  }
  const markup=bareCode(layout.markup).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,"");
  const css=bareCode(layout.css).replace(/<\/?style[^>]*>/gi,"");
  const sources=t.sources.map(s=>s.key+" "+s.title+" "+clipText(s.excerpt,s.id===t.targetId?900:200)).join("\n");
  const coding=[
    {role:"system",content:"Implement one offline interaction using plain browser JavaScript. The DOM below already exists before this script runs. Bind to its actual IDs. Handle form submissions via preventDefault; show the result in the page using textContent. Initialization must work in an iframe without storage. Wrap optional localStorage use in try/catch. Preserve any requested behavior. No imports, third-party APIs, network, HTML wrappers or code fences. Keep the script concise, ideally under 1000 characters. Return the complete script in the JSON script field."},
    {role:"user",content:"Language: "+t.lang+"\nUser request: "+t.request+"\nScoped context:\n"+sources+"\nIntended behavior: "+layout.interaction+"\nExisting DOM:\n"+markup}
  ];
  const jsStep=choose("2/2 · 编写交互","2/2 · Implementing interaction");
  let js;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const code=await modelJSON(coding,obj({script:shortText(3000)}),1400,jsStep,signal);
      js=bareCode(code.script).replace(/^<script[^>]*>|<\/script>$/gi,"");
      new Function(js); // Syntax check only. The artifact runs inside its preview frame.
      break;
    }catch(err){
      if(signal.aborted||attempt||!(err instanceof SyntaxError||err.code==="length"))throw err;
      coding.push({role:"user",content:"The last draft failed validation. Write a short syntactically complete handler for the primary action only, using the existing DOM."});
    }
  }
  const content='<!doctype html><html lang="'+t.lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(layout.title)+'</title><style>'+css+'</style></head><body>'+markup+'<script>'+js.replace(/<\/script/gi,"<\\/script")+'<\/script></body></html>';
  return {title:layout.title,basis:layout.basis,content};
}
