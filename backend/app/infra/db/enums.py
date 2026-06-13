import enum


class RevisionStatus(str, enum.Enum):
    DRAFT = "draft"
    REVIEW = "review"
    APPROVED = "approved"
    RELEASED = "released"


class ConnectorRole(str, enum.Enum):
    POWER = "power"
    CAN = "can"
    ETHERNET = "ethernet"
    SENSOR = "sensor"
    HV = "hv"
    LV = "lv"
    INTERLOCK = "interlock"
    SPARE = "spare"


class SignalKind(str, enum.Enum):
    DIGITAL = "digital"
    ANALOG = "analog"
    POWER = "power"
    GROUND = "ground"
    DIFFERENTIAL = "differential"
    BUS = "bus"
    CUSTOM = "custom"


class EdgeManufacturingState(str, enum.Enum):
    PLANNED = "planned"
    ASSIGNED = "assigned"
    BUILT = "built"
    TESTED = "tested"
    RELEASED = "released"


class HarnessScope(str, enum.Enum):
    INTERNAL = "internal"
    EXTERNAL = "external"


class EntityKind(str, enum.Enum):
    VEHICLE = "vehicle"
    ENCLOSURE_INSTANCE = "enclosure_instance"
    PCB_INSTANCE = "pcb_instance"
    CONNECTOR_INSTANCE = "connector_instance"
    PIN = "pin"
    SIGNAL = "signal"
    CONNECTION_EDGE = "connection_edge"
    SPLICE_NODE = "splice_node"


class ConnectorGender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    HERMAPHRODITIC = "hermaphroditic"
    UNKNOWN = "unknown"


class ConnectorCategory(str, enum.Enum):
    WIRE_TO_WIRE = "wire_to_wire"
    WIRE_TO_BOARD = "wire_to_board"
