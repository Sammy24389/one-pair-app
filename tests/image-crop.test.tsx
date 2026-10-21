import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import ImageCropper from '../src/components/ImageCropper'
import {squareCrop,cropImage} from '../src/lib/image-crop'
let close:ReturnType<typeof vi.fn>,draw:ReturnType<typeof vi.fn>
beforeEach(()=>{
  close=vi.fn();draw=vi.fn();vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:800,height:400,close})))
  vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:crop'),revokeObjectURL:vi.fn()})
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draw} as any)
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>callback(new Blob(['cropped'],{type:'image/png'})))
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('computes bounded square crops for portrait, landscape and zoomed selections',()=>{
  expect(squareCrop(800,400,1,50,50)).toEqual({x:200,y:0,size:400})
  expect(squareCrop(400,800,2,100,100)).toEqual({x:200,y:600,size:200})
  expect(()=>squareCrop(0,400,1,50,50)).toThrow();expect(()=>squareCrop(400,400,5,50,50)).toThrow()
})
it('encodes the selected source region with a512px output limit',async()=>{
  await cropImage({width:1600,height:1200} as ImageBitmap,squareCrop(1600,1200,1,0,0))
  expect(draw).toHaveBeenCalledWith(expect.anything(),0,0,1200,1200,0,0,512,512)
  await expect(cropImage({width:100,height:100} as ImageBitmap,{x:100,y:0,size:20})).rejects.toThrow()
})
it('previews, saves, cancels and cleans up the crop resources',async()=>{
  const save=vi.fn(async()=>{}),cancel=vi.fn();const view=render(<ImageCropper file={new File(['img'],'photo.png')} onSave={save} onOriginal={vi.fn()} onCancel={cancel}/>)
  await screen.findByAltText('Sticker crop preview');fireEvent.change(screen.getByLabelText('Zoom'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Horizontal crop position'),{target:{value:'100'}})
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Crop and add'}))})
  expect(save).toHaveBeenCalledWith(expect.objectContaining({type:'image/png'}));expect(draw.mock.calls[0].slice(1,5)).toEqual([600,100,200,200])
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(cancel).toHaveBeenCalledOnce()
  view.unmount();expect(close).toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:crop')
})
it('reports storage and decode failures without pretending to save',async()=>{
  const save=vi.fn(async()=>{throw new Error('Storage full')})
  const view=render(<ImageCropper file={new File(['img'],'photo.png')} onSave={save} onOriginal={vi.fn()} onCancel={vi.fn()}/>)
  await screen.findByAltText('Sticker crop preview');await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Crop and add'}))})
  expect(screen.getByRole('alert').textContent).toBe('Storage full');view.unmount()
  vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('Bad image'))
  render(<ImageCropper file={new File(['bad'],'bad.png')} onSave={vi.fn()} onOriginal={vi.fn()} onCancel={vi.fn()}/>)
  expect((await screen.findByRole('alert')).textContent).toBe('Bad image')
})
