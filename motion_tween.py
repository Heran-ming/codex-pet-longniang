"""Offline, bidirectional motion compensation for the illustrated keyframes."""
import cv2
import numpy as np
from PIL import Image

cv2.setNumThreads(2)

def inbetweens(first, last, steps=6):
    width, height=first.size
    small=(640,360)
    def gray(im):
        rgba=np.asarray(im.resize(small,Image.Resampling.LANCZOS),dtype=np.float32)
        alpha=rgba[:,:,3:4]/255
        composite=np.clip(rgba[:,:,:3]*alpha+245*(1-alpha),0,255).astype(np.uint8)
        return cv2.cvtColor(composite,cv2.COLOR_RGB2GRAY)
    before,after=gray(first),gray(last)
    estimator=cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    estimator.setFinestScale(0)
    forward=estimator.calc(before,after,None)
    backward=estimator.calc(after,before,None)
    forward=cv2.resize(forward,(width,height),interpolation=cv2.INTER_LINEAR)
    backward=cv2.resize(backward,(width,height),interpolation=cv2.INTER_LINEAR)
    forward[:,:,0]*=width/640;forward[:,:,1]*=height/360
    backward[:,:,0]*=width/640;backward[:,:,1]*=height/360
    grid_x,grid_y=np.meshgrid(np.arange(width,dtype=np.float32),np.arange(height,dtype=np.float32))
    a=np.asarray(first.convert('RGBa'))
    b=np.asarray(last.convert('RGBa'))
    result=[first]
    for step in range(1,steps):
        t=step/steps
        # Remap each direction toward the intermediate position, then blend in
        # premultiplied alpha. Source poses remain unchanged at their boundaries.
        warped_a=cv2.remap(a,grid_x-t*forward[:,:,0],grid_y-t*forward[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        warped_b=cv2.remap(b,grid_x-(1-t)*backward[:,:,0],grid_y-(1-t)*backward[:,:,1],cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
        mixed=cv2.addWeighted(warped_a,1-t,warped_b,t,0)
        result.append(Image.fromarray(mixed,mode='RGBa').convert('RGBA'))
    return result
