import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMove, runPromptGraphMove } from './graphEngine';
import { defaultPromptGraph } from '../src/defaultGraph';

const request = {fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',graph:defaultPromptGraph,
 context:{sanHistory:'',uciHistory:'',moveNumber:1,lastMove:'',llmSide:'white' as const,humanSide:'black' as const}};
test('long castle is not mistaken for short castle',()=>{
 assert.equal(extractMove('O-O-O','white'),'e1c1');
 assert.equal(extractMove('0-0-0','black'),'e8c8');
 assert.equal(extractMove('O-O','black'),'e8g8');
});
test('parser cannot harvest a move from commentary or alternatives',()=>{
 assert.equal(extractMove('Avoid e2e4. Play d2d4.','white'),'');
 assert.equal(extractMove('e2e4 d2d4','white'),'');
});
test('bad reply stops without a substitute or a second model call',async()=>{
 let calls=0;
 await assert.rejects(runPromptGraphMove(request,{provider:{async complete(){calls++;return {text:'e2e5'};}}}),/No substitute/);
 assert.equal(calls,1);
});
test('legal model move is applied exactly',async()=>{
 const r=await runPromptGraphMove(request,{provider:{async complete(){return {text:'e2e4'};}}});
 assert.equal(r.move,'e2e4');assert.equal(r.san,'e4');assert.equal(r.fallbackUsed,false);
});
