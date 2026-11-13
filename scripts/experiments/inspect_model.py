"""Print the first ops of the ONNX graph (what 'normalization inside the model' actually does)
and probe how the score reacts to different input scalings of the same real landmarks."""
import sys

import numpy as np
import onnx
from onnx import numpy_helper

m = onnx.load(sys.argv[1])
inits = {i.name: numpy_helper.to_array(i) for i in m.graph.initializer}
print("input:", [(i.name, [d.dim_value or d.dim_param for d in i.type.tensor_type.shape.dim]) for i in m.graph.input])
for n in m.graph.node[:45]:
    consts = []
    for x in n.input:
        if x in inits and inits[x].size <= 8:
            consts.append(f"{x}={inits[x].tolist()}")
    attrs = {a.name: onnx.helper.get_attribute_value(a) for a in n.attribute}
    attrs = {k: (v if not isinstance(v, bytes) else v[:30]) for k, v in attrs.items() if k != "value"}
    print(f"{n.op_type:16s} in={list(n.input)[:3]} out={list(n.output)[:1]} {consts} {attrs}")
