import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pickQuestions,markAnswer,startTimer,timeLeft,pauseTimer,resumeTimer,isExpired,teamBehaviourPoints} from '../src/checkpoint/checkpoint.mjs';
import {POINTS_PER_SECURE_ANSWER,CHECKPOINT_SECONDS} from '../src/config.mjs';
const bank=JSON.parse(await readFile(new URL('../1-foundation/data/questions.json',import.meta.url)));
test('contract: pickQuestions returns exactly count for each phase',()=>{
  for(const phaseId of ['phase_1','phase_2','phase_3','phase_4']){
    for(const count of [0,1,2,3,4])assert.equal(pickQuestions(bank,phaseId,count).length,count);
  }
});
test('contract: every device gets the same IDs even if the bank order differs',()=>{
  const reverse={questions:[...bank.questions].reverse()};
  for(const phaseId of ['phase_1','phase_2','phase_3','phase_4'])
    assert.deepEqual(pickQuestions(bank,phaseId,4),pickQuestions(reverse,phaseId,4));
});
test('contract: two-question sets mix easier and harder tiers',()=>{
  for(const phaseId of ['phase_1','phase_2','phase_3','phase_4']){
    const picked=pickQuestions(bank,phaseId,2);assert.notEqual(picked[0].tier,picked[1].tier);
  }
});
test('contract: agreed four-question sets are preserved',()=>{
  const expected={phase_1:['Q01','Q02','Q29','Q03'],phase_2:['Q09','Q10','Q37','Q11'],
    phase_3:['Q15','Q16','Q12','Q08'],phase_4:['Q22','Q30','Q32','Q31']};
  for(const [phaseId,ids] of Object.entries(expected))
    assert.deepEqual(pickQuestions(bank,phaseId,4).map(q=>q.id),ids);
});
test('contract: selection preserves originals and supports a question array bank',()=>{
  const picked=pickQuestions(bank.questions,'phase_1',4);
  picked.forEach(q=>assert.deepEqual(q,bank.questions.find(original=>original.id===q.id)));
  picked[0].options.A='Changed';
  assert.notEqual(pickQuestions(bank,'phase_1',4)[0].options.A,'Changed');
});
test('contract: impossible counts and unknown phases fail clearly',()=>{
  assert.throws(()=>pickQuestions(bank,'phase_2',5),/count/);
  assert.throws(()=>pickQuestions(bank,'phase_1',-1),/count/);
  assert.throws(()=>pickQuestions(bank,'phase_5',4),/Unknown/);
});
test('contract: markAnswer returns precisely correct, points and explanation',()=>{
  const q=pickQuestions(bank,'phase_1',1)[0];
  assert.deepEqual(markAnswer(q,q.correct),{correct:true,points:POINTS_PER_SECURE_ANSWER,explanation:q.explanation});
  for(const choice of ['A',null,undefined])
    assert.deepEqual(markAnswer(q,choice),{correct:false,points:0,explanation:q.explanation});
});
test('contract: timer has exactly the shape the engine expects, including zero timestamp',()=>{
  assert.deepEqual(startTimer(0),{startedAt:0,pausedAt:null,pausedMs:0});
});
test('contract: timeLeft uses the shared config duration and never goes negative',()=>{
  const timer=startTimer(100);
  assert.equal(timeLeft(timer,100),CHECKPOINT_SECONDS*1000);
  assert.equal(timeLeft(timer,1100),CHECKPOINT_SECONDS*1000-1000);
  assert.equal(timeLeft(timer,100+CHECKPOINT_SECONDS*1000+5000),0);
});
test('contract: frozen timer inputs stay unchanged and every operation returns a fresh object',()=>{
  const timer=Object.freeze(startTimer(0));
  const paused=Object.freeze(pauseTimer(timer,10000));
  const resumed=resumeTimer(paused,60000);
  assert.deepEqual(timer,{startedAt:0,pausedAt:null,pausedMs:0});
  assert.deepEqual(paused,{startedAt:0,pausedAt:10000,pausedMs:0});
  assert.deepEqual(resumed,{startedAt:0,pausedAt:null,pausedMs:50000});
  assert.notEqual(paused,timer);assert.notEqual(resumed,paused);
  assert.notEqual(pauseTimer(paused,60000),paused);
  assert.notEqual(resumeTimer(timer,1000),timer);
});
test('contract: repeated pauses do not restart the pause window',()=>{
  const timer=pauseTimer(startTimer(0),0);const repeated=pauseTimer(timer,50000);
  assert.equal(repeated.pausedAt,0);assert.equal(timeLeft(repeated,100000),CHECKPOINT_SECONDS*1000);
});
test('contract: multiple pause cycles exclude only time spent paused',()=>{
  let timer=startTimer(0);timer=pauseTimer(timer,20000);timer=resumeTimer(timer,60000);
  timer=pauseTimer(timer,70000);timer=resumeTimer(timer,100000);
  assert.equal(timer.pausedMs,70000);
  assert.equal(timeLeft(timer,110000),CHECKPOINT_SECONDS*1000-40000);
});
test('contract: isExpired returns a boolean at the exact deadline and pause cannot reverse expiry',()=>{
  const timer=startTimer(0);const limit=CHECKPOINT_SECONDS*1000;
  assert.equal(isExpired(timer,limit-1),false);assert.equal(isExpired(timer,limit),true);
  const paused=pauseTimer(timer,limit);assert.equal(isExpired(paused,limit+5000),true);
});


test('team contract: each question is averaged across the eligible player roster',()=>{
  const answers=[
    {phase:0,questionId:'Q01',player:'a',choice:'B',correct:true},
    {phase:0,questionId:'Q01',player:'b',choice:'A',correct:false},
    {phase:0,questionId:'Q02',player:'a',choice:'C',correct:true},
    {phase:0,questionId:'Q02',player:'b',choice:'C',correct:true},
  ];
  assert.equal(teamBehaviourPoints(answers,['a','b']),POINTS_PER_SECURE_ANSWER*1.5);
  assert.equal(teamBehaviourPoints(answers,[{id:'a'},{id:'b'},{id:'c'}]),POINTS_PER_SECURE_ANSWER);
});
test('team contract: unanswered questions and entirely unanswered players score zero',()=>{
  assert.equal(teamBehaviourPoints([],['a','b']),0);
  assert.equal(teamBehaviourPoints([{questionId:'Q01',player:'a',correct:true}],['a','b']),POINTS_PER_SECURE_ANSWER/2);
});
test('team contract: no roster supports the current reducer and single-screen mode',()=>{
  assert.equal(teamBehaviourPoints([{questionId:'Q01',player:null,correct:true}]),POINTS_PER_SECURE_ANSWER);
  assert.equal(teamBehaviourPoints([{questionId:'Q01',player:null,correct:true}],[]),POINTS_PER_SECURE_ANSWER);
  assert.equal(teamBehaviourPoints([
    {questionId:'Q01',player:'a',correct:true},{questionId:'Q01',player:'b',correct:false},
  ]),POINTS_PER_SECURE_ANSWER/2);
});
test('team contract: scoring is immutable and duplicate or unknown players are rejected',()=>{
  const answers=Object.freeze([Object.freeze({questionId:'Q01',player:'a',correct:true})]);
  assert.equal(teamBehaviourPoints(answers,['a']),POINTS_PER_SECURE_ANSWER);
  assert.throws(()=>teamBehaviourPoints([...answers,...answers],['a']),/twice/);
  assert.throws(()=>teamBehaviourPoints(answers,['b']),/not in/);
});
test('team contract: fractions are preserved and larger teams cannot inflate the maximum',()=>{
  const answers=[
    {questionId:'Q01',player:'a',correct:true},{questionId:'Q01',player:'b',correct:false},
    {questionId:'Q01',player:'c',correct:false},
  ];
  assert.equal(teamBehaviourPoints(answers,['a','b','c']),POINTS_PER_SECURE_ANSWER/3);
  const all=answers.map(answer=>({...answer,correct:true}));
  assert.equal(teamBehaviourPoints(all,['a','b','c']),POINTS_PER_SECURE_ANSWER);
});
