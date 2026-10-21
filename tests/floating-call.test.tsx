import {useRef} from 'react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import {useFloatingCall} from '../src/components/useFloatingCall'

function Panel({enabled=true}: {enabled?:boolean}) {
  const root=useRef<HTMLDivElement>(null)
  const floating=useFloatingCall(root,enabled)
  return <div ref={root} data-testid="panel" style={floating.style}><button {...floating.handle}>Move window</button><button>Mute</button></div>
}
beforeEach(()=>{
  vi.stubGlobal('innerWidth',390); vi.stubGlobal('innerHeight',844)
  class TestPointerEvent extends MouseEvent {
    pointerId:number; isPrimary:boolean
    constructor(type:string,init:PointerEventInit={}) {super(type,init);this.pointerId=init.pointerId??1;this.isPrimary=init.isPrimary??true}
  }
  vi.stubGlobal('PointerEvent',TestPointerEvent)
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const left=parseFloat(this.style.left)||156,top=parseFloat(this.style.top)||400
    return {left,top,width:224,height:240,right:left+224,bottom:top+240,x:left,y:top,toJSON:()=>({})}
  })
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})

it('drags with a pointer and stops moving after pointer release',()=>{
  render(<Panel />)
  const handle=screen.getByRole('button',{name:'Move window'}),panel=screen.getByTestId('panel')
  fireEvent.pointerDown(handle,{pointerId:1,clientX:180,clientY:420,button:0})
  fireEvent.pointerMove(handle,{pointerId:1,clientX:80,clientY:220})
  expect(panel.style.left).toBe('56px');expect(panel.style.top).toBe('200px')
  fireEvent.pointerUp(handle,{pointerId:1})
  fireEvent.pointerMove(handle,{pointerId:1,clientX:200,clientY:500})
  expect(panel.style.left).toBe('56px')
})
it('clamps each edge, supports touch pointers and ignores secondary pointers',()=>{
  render(<Panel />)
  const handle=screen.getByRole('button',{name:'Move window'}),panel=screen.getByTestId('panel')
  fireEvent.pointerDown(handle,{pointerId:3,pointerType:'touch',clientX:180,clientY:420,button:0})
  fireEvent.pointerMove(handle,{pointerId:8,clientX:-900,clientY:-900})
  expect(panel.style.left).toBe('156px')
  fireEvent.pointerMove(handle,{pointerId:3,clientX:-900,clientY:-900})
  expect(panel.style.left).toBe('8px');expect(panel.style.top).toBe('8px')
  fireEvent.pointerMove(handle,{pointerId:3,clientX:9000,clientY:9000})
  expect(panel.style.left).toBe('158px');expect(panel.style.top).toBe('596px')
  fireEvent.pointerCancel(handle,{pointerId:3})
  fireEvent.pointerMove(handle,{pointerId:3,clientX:0,clientY:0})
  expect(panel.style.left).toBe('158px')
})
it('supports keyboard movement, leaves other controls independent, and remembers placement after restore',()=>{
  const view=render(<Panel />)
  const handle=screen.getByRole('button',{name:'Move window'}),panel=screen.getByTestId('panel')
  fireEvent.keyDown(handle,{key:'ArrowLeft'})
  expect(panel.style.left).toBe('140px')
  fireEvent.keyDown(handle,{key:'ArrowUp',shiftKey:true})
  expect(panel.style.top).toBe('352px')
  fireEvent.pointerDown(screen.getByRole('button',{name:'Mute'}),{clientX:10,clientY:10,button:0})
  fireEvent.pointerMove(handle,{clientX:100,clientY:100})
  expect(panel.style.top).toBe('352px')
  view.rerender(<Panel enabled={false} />)
  expect(panel.style.left).toBe('')
  view.rerender(<Panel />)
  expect(panel.style.left).toBe('140px');expect(panel.style.top).toBe('352px')
})
it('reclamps on viewport resize, keyboard viewport changes and removes listeners on unmount',()=>{
  const viewport=new EventTarget() as EventTarget & {width:number;height:number;offsetTop:number;offsetLeft:number}
  Object.assign(viewport,{width:390,height:844,offsetTop:0,offsetLeft:0})
  vi.stubGlobal('visualViewport',viewport)
  const remove=vi.spyOn(viewport,'removeEventListener')
  const view=render(<Panel />),panel=screen.getByTestId('panel')
  viewport.width=300;viewport.height=400;viewport.offsetTop=20
  act(()=>viewport.dispatchEvent(new Event('resize')))
  expect(panel.style.left).toBe('68px');expect(panel.style.top).toBe('172px')
  fireEvent.keyDown(screen.getByRole('button',{name:'Move window'}),{key:'Home'})
  expect(panel.style.left).toBe('68px');expect(panel.style.top).toBe('52px')
  view.unmount()
  expect(remove).toHaveBeenCalledWith('resize',expect.any(Function))
  expect(remove).toHaveBeenCalledWith('scroll',expect.any(Function))
})
