import {router} from 'expo-router';
import {Pressable,Text,View} from 'react-native';
import type {BloomStage} from '../domain/bloom';
import type {DayMode} from '../domain/dayMode';
import {LivingBloom} from './LivingBloom';
import {Icon} from './Brand';
export function BloomNavigation({stage,mode='standard',current}:{stage:BloomStage;mode?:DayMode;current:'today'|'journey'|'assistant'}){
const items=[{label:'Hari ini',icon:'home',path:'/today' as const,active:current==='today'},{label:'Ritme',icon:'plan',path:'/day-mode' as const},{label:'Bloom',icon:'bloom',path:'/journey' as const,active:current==='journey'},{label:'Check-in',icon:'mind',path:'/checkin' as const},{label:'Asisten',icon:'mind',path:'/assistant' as const,active:current==='assistant'}];
return <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingTop:10,paddingBottom:12,paddingHorizontal:8,backgroundColor:'#101D18',borderTopWidth:1,borderColor:'#D4C2A521'}}>{items.map(item=><Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.icon==='bloom'?'Living Bloom · buka perjalananmu':item.label} accessibilityState={{selected:!!item.active}} onPress={()=>router.replace(item.path)} style={{minHeight:52,minWidth:48,flex:1,alignItems:'center',justifyContent:'center',gap:6}}>{item.icon==='bloom'?<View style={{width:52,height:52,borderRadius:26,backgroundColor:'#EAC9B6',borderWidth:1,borderColor:'#F7E8D5',marginTop:-24,alignItems:'center',justifyContent:'center'}}><LivingBloom stage={stage} mode={mode} compact decorative size={46}/></View>:<Icon name={item.icon} size={20} color={item.active?'#F2D7C2':'#A8AA98'}/>}<Text style={{fontSize:9,color:item.active?'#F2D7C2':'#B2B3A6'}}>{item.label}</Text></Pressable>)}</View>;}

